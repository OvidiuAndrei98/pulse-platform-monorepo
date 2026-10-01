package tickets

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/organizer"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	Queries      *db.Queries
	DB           *pgxpool.Pool
	PublicAppURL string
}

func NewHandler(queries *db.Queries, pool *pgxpool.Pool, publicAppURL string) *Handler {
	return &Handler{
		Queries:      queries,
		DB:           pool,
		PublicAppURL: strings.TrimRight(publicAppURL, "/"),
	}
}

type PurchaseTicketsRequest struct {
	EventID      string `json:"eventId"`
	TicketTypeID string `json:"ticketTypeId"`
	Email        string `json:"email"`
	Quantity     int32  `json:"quantity"`
}

func (h *Handler) HandlePurchaseTickets(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req PurchaseTicketsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	// Validări de bază ale input-ului
	if req.Email == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Adresa de email este obligatorie")
		return
	}
	if req.Quantity <= 0 {
		router.RespondWithError(w, http.StatusBadRequest, "Cantitatea de bilete trebuie să fie mai mare decât 0")
		return
	}

	var pgEventID pgtype.UUID
	if err := pgEventID.Scan(req.EventID); err != nil || !pgEventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este un UUID invalid")
		return
	}

	var pgTicketTypeID pgtype.UUID
	if err := pgTicketTypeID.Scan(req.TicketTypeID); err != nil || !pgTicketTypeID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul tipului de bilet este un UUID invalid")
		return
	}

	// 1. Extragere opțională a ID-ului de utilizator din Context (dacă este logat)
	var pgUserID pgtype.UUID
	userIDStr, err := auth.GetUserIDFromContext(ctx)
	if err == nil && userIDStr != "" {
		if err := pgUserID.Scan(userIDStr); err != nil {
			pgUserID.Valid = false // Fallback la NULL în caz de string corupt
		}
	} else {
		pgUserID.Valid = false // Înseamnă că utilizatorul cumpără ca vizitator anonim (guest)
	}

	// 2. Inițierea tranzacției SQL pentru securizarea stocului
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la inițierea tranzacției: "+err.Error())
		return
	}
	defer tx.Rollback(ctx)

	// Legăm query-urile generate de sqlc la tranzacția activă
	qtx := h.Queries.WithTx(tx)

	// 3. Blocăm și citim tipul de bilet utilizând SELECT FOR UPDATE pentru a preveni suprarezervarea (race conditions)
	ticketType, err := qtx.GetTicketTypeForUpdate(ctx, pgTicketTypeID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Tipul de bilet specificat nu a fost găsit")
		return
	}

	// 4. Verificăm validitatea stocului și a calendarului de vânzări
	if ticketType.TicketsSold+req.Quantity > ticketType.Capacity {
		router.RespondWithError(w, http.StatusConflict, "Nu mai există suficiente bilete disponibile în stoc")
		return
	}

	now := time.Now()
	if now.Before(ticketType.StartSales.Time) || now.After(ticketType.EndSales.Time) {
		router.RespondWithError(w, http.StatusBadRequest, "Vânzările pentru acest tip de bilet sunt închise în acest moment")
		return
	}

	totalAmount := req.Quantity * ticketType.PriceRon

	err = qtx.IncrementTicketsSold(ctx, db.IncrementTicketsSoldParams{
		ID:          pgTicketTypeID,
		TicketsSold: req.Quantity,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la actualizarea stocului: "+err.Error())
		return
	}

	// 6. Creăm comanda (Order) în starea implicită 'pending' (în așteptarea plății Stripe)
	order, err := qtx.CreateOrder(ctx, db.CreateOrderParams{
		UserID:      pgUserID,
		EventID:     pgEventID,
		Email:       req.Email,
		TotalAmount: totalAmount,
		Status:      db.OrderStatusPending,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la înregistrarea comenzii: "+err.Error())
		return
	}

	// 7. Generăm instanțele de bilet cu hash criptografic unic pentru codul QR
	for i := int32(0); i < req.Quantity; i++ {
		hash := generateSecureValidationHash(req.Email, order.ID, i)

		_, err = qtx.CreateTicket(ctx, db.CreateTicketParams{
			OrderID:        order.ID,
			TicketTypeID:   pgTicketTypeID,
			UserID:         pgUserID, // Asociat contului sau NULL
			ValidationHash: hash,
		})
		if err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Eroare la generarea biletelor: "+err.Error())
			return
		}
	}

	// Salvăm definitiv tranzacția în baza de date
	if err := tx.Commit(ctx); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la finalizarea tranzacției: "+err.Error())
		return
	}

	// Pentru răspunsul JSON folosești maparea ta din pachetul DTO
	router.RespondWithJSON(w, http.StatusCreated, MapOrder(order))
}

func (h *Handler) HandleGetTicketTypesForEvent(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	eventIDStr := chi.URLParam(r, "id")

	var eventID pgtype.UUID
	if err := eventID.Scan(eventIDStr); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului din URL este invalid")
		return
	}

	types, err := h.Queries.GetTicketTypesForEvent(ctx, eventID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Nu s-au găsit tipuri de bilete pentru acest eveniment")
		return
	}

	result := make([]TicketTypesResponse, 0, len(types))
	for _, e := range types {
		result = append(result, MapTicketTypesList(e))
	}

	router.RespondWithJSON(w, http.StatusOK, result)
}

func (h *Handler) HandleGetUserTickets(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDStr, err := auth.GetUserIDFromContext(ctx)
	if err != nil || userIDStr == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	var userID pgtype.UUID
	if err := userID.Scan(userIDStr); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return
	}

	tickets, err := h.Queries.GetUserTickets(ctx, userID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la obținerea biletelor utilizatorului: "+err.Error())
		return
	}
	result := make([]UserTicketResponse, 0, len(tickets))
	for _, ticket := range tickets {
		result = append(result, MapUserTicket(ticket))
	}
	router.RespondWithJSON(w, http.StatusOK, result)
}

func (h *Handler) HandleGetUserOrders(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDStr, err := auth.GetUserIDFromContext(ctx)
	if err != nil || userIDStr == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	var userID pgtype.UUID
	if err := userID.Scan(userIDStr); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return
	}
	orders, err := h.Queries.ListUserOrders(ctx, userID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Facturile nu au putut fi incarcate")
		return
	}
	result := make([]UserOrderResponse, 0, len(orders))
	for _, order := range orders {
		result = append(result, MapUserOrder(order))
	}
	router.RespondWithJSON(w, http.StatusOK, result)
}

type ValidateTicketRequest struct {
	ValidationHash string `json:"validationHash"`
}

type AddValidationStaffRequest struct {
	Email string `json:"email"`
}

type CreateScannerAccessRequest struct {
	Label    string `json:"label"`
	StartsAt string `json:"startsAt"`
	EndsAt   string `json:"endsAt"`
}

type CreateScannerSessionRequest struct {
	Token string `json:"token"`
}

type OfflineTicketSnapshot struct {
	TicketID       string `json:"ticketId"`
	ValidationHash string `json:"validationHash"`
	TicketType     string `json:"ticketType"`
}

type OfflineValidationSnapshotResponse struct {
	SnapshotID  string                  `json:"snapshotId"`
	EventID     string                  `json:"eventId"`
	EventTitle  string                  `json:"eventTitle"`
	GeneratedAt string                  `json:"generatedAt"`
	ExpiresAt   string                  `json:"expiresAt"`
	TicketCount int32                   `json:"ticketCount"`
	Tickets     []OfflineTicketSnapshot `json:"tickets"`
}

type OfflineTicketScanPayload struct {
	ClientScanID   string `json:"clientScanId"`
	ValidationHash string `json:"validationHash"`
	ScannedAt      string `json:"scannedAt"`
}

type SyncOfflineTicketScansRequest struct {
	SnapshotID string                     `json:"snapshotId"`
	DeviceID   string                     `json:"deviceId"`
	Scans      []OfflineTicketScanPayload `json:"scans"`
}

type OfflineTicketSyncResult struct {
	ClientScanID string `json:"clientScanId"`
	Status       string `json:"status"`
	TicketID     string `json:"ticketId,omitempty"`
	TicketType   string `json:"ticketType,omitempty"`
	EventTitle   string `json:"eventTitle,omitempty"`
	ValidatedAt  string `json:"validatedAt,omitempty"`
}

type SyncOfflineTicketScansResponse struct {
	Results []OfflineTicketSyncResult `json:"results"`
}

func (h *Handler) isEventManager(ctx context.Context, eventID, userID pgtype.UUID) (bool, error) {
	event, err := h.Queries.GetEventWithStats(ctx, eventID)
	if err != nil {
		return false, err
	}
	return event.OrganizerID == userID, nil
}

func (h *Handler) canValidateEvent(ctx context.Context, eventID, userID pgtype.UUID) (db.GetEventWithStatsRow, bool, error) {
	event, err := h.Queries.GetEventWithStats(ctx, eventID)
	if err != nil {
		return db.GetEventWithStatsRow{}, false, err
	}
	if event.OrganizerID == userID {
		return event, true, nil
	}
	isStaff, err := h.Queries.IsValidationStaffForEvent(ctx, db.IsValidationStaffForEventParams{EventID: eventID, UserID: userID})
	if err != nil {
		return event, false, err
	}
	return event, isStaff, nil
}

func (h *Handler) HandleListMyValidationScans(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDString, err := auth.GetUserIDFromContext(ctx)
	if err != nil || userIDString == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var userID, eventID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return
	}
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}

	if _, allowed, err := h.canValidateEvent(ctx, eventID, userID); err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	} else if !allowed {
		router.RespondWithError(w, http.StatusForbidden, "Nu ai permisiunea sa vezi scanarile acestui eveniment")
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT t.id, tt.name, t.validated_at, COUNT(*) OVER ()
		FROM tickets t
		JOIN ticket_types tt ON tt.id = t.ticket_type_id
		WHERE tt.event_id = $1
		  AND t.validated_by_user_id = $2
		  AND t.is_validated = TRUE
		ORDER BY t.validated_at DESC
		LIMIT 20`, eventID, userID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Istoricul scanarilor nu a putut fi incarcat")
		return
	}
	defer rows.Close()

	response := ValidationScanHistoryResponse{Scans: []ValidationScanHistoryItem{}}
	for rows.Next() {
		var ticketID pgtype.UUID
		var ticketType string
		var validatedAt pgtype.Timestamptz
		var total int64
		if err := rows.Scan(&ticketID, &ticketType, &validatedAt, &total); err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Istoricul scanarilor nu a putut fi citit")
			return
		}
		response.TotalScans = total
		response.Scans = append(response.Scans, ValidationScanHistoryItem{
			TicketID:    common.UUIDToString(ticketID),
			TicketType:  ticketType,
			ValidatedAt: common.TimestampToString(validatedAt),
		})
	}
	if err := rows.Err(); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Istoricul scanarilor nu a putut fi citit")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, response)
}

func parseValidationHash(value string) (string, bool) {
	value = strings.TrimSpace(value)
	if len(value) != 64 {
		return "", false
	}
	if _, err := hex.DecodeString(value); err != nil {
		return "", false
	}
	return value, true
}

func (h *Handler) HandleListValidationEvents(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDString, err := auth.GetUserIDFromContext(ctx)
	if err != nil || userIDString == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var userID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return
	}

	events, err := h.Queries.ListValidationEvents(ctx, userID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Evenimentele pentru validare nu au putut fi incarcate")
		return
	}

	result := make([]ValidationEventResponse, 0, len(events))
	for _, event := range events {
		result = append(result, MapValidationEvent(event))
	}
	router.RespondWithJSON(w, http.StatusOK, result)
}

func (h *Handler) HandleListValidationStaff(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDString, err := auth.GetUserIDFromContext(ctx)
	if err != nil || userIDString == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var userID, eventID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return
	}
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}

	isManager, err := h.isEventManager(ctx, eventID, userID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	}
	if !isManager {
		router.RespondWithError(w, http.StatusForbidden, "Doar organizatorul poate vedea echipa de validare")
		return
	}

	staff, err := h.Queries.ListValidationStaff(ctx, eventID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Lista validatorilor nu a putut fi incarcata")
		return
	}

	result := make([]ValidationStaffResponse, 0, len(staff))
	for _, member := range staff {
		result = append(result, MapValidationStaff(member))
	}
	router.RespondWithJSON(w, http.StatusOK, result)
}

func (h *Handler) HandleAddValidationStaff(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDString, err := auth.GetUserIDFromContext(ctx)
	if err != nil || userIDString == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var userID, eventID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return
	}
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}

	isManager, err := h.isEventManager(ctx, eventID, userID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	}
	if !isManager {
		router.RespondWithError(w, http.StatusForbidden, "Doar organizatorul poate adauga validatori")
		return
	}

	var req AddValidationStaffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Emailul validatorului este obligatoriu")
		return
	}

	validator, err := h.Queries.GetUserByEmail(ctx, req.Email)
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusNotFound, "Nu exista un cont Spottr cu acest email")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Validatorul nu a putut fi cautat")
		return
	}
	if !validator.IsActive.Bool {
		router.RespondWithError(w, http.StatusBadRequest, "Contul validatorului trebuie activat mai intai")
		return
	}
	if validator.ID == userID {
		router.RespondWithError(w, http.StatusBadRequest, "Organizatorul are deja acces la validare")
		return
	}

	if err := h.Queries.AddValidationStaff(ctx, db.AddValidationStaffParams{EventID: eventID, UserID: validator.ID, AddedBy: userID}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Validatorul nu a putut fi adaugat")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) HandleRemoveValidationStaff(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDString, err := auth.GetUserIDFromContext(ctx)
	if err != nil || userIDString == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var userID, eventID, validatorID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return
	}
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}
	if err := validatorID.Scan(chi.URLParam(r, "userId")); err != nil || !validatorID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul validatorului este invalid")
		return
	}

	isManager, err := h.isEventManager(ctx, eventID, userID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	}
	if !isManager {
		router.RespondWithError(w, http.StatusForbidden, "Doar organizatorul poate elimina validatori")
		return
	}

	if err := h.Queries.RemoveValidationStaff(ctx, db.RemoveValidationStaffParams{EventID: eventID, UserID: validatorID}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Validatorul nu a putut fi eliminat")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) HandleCreateScannerAccess(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDString, err := auth.GetUserIDFromContext(ctx)
	if err != nil || userIDString == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var userID, eventID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return
	}
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}

	event, err := h.Queries.GetEventWithStats(ctx, eventID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	}
	if event.OrganizerID != userID {
		router.RespondWithError(w, http.StatusForbidden, "Doar organizatorul poate crea linkuri de scanare")
		return
	}

	var req CreateScannerAccessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid")
		return
	}
	req.Label = strings.TrimSpace(req.Label)
	if req.Label == "" || len(req.Label) > 80 {
		router.RespondWithError(w, http.StatusBadRequest, "Numele punctului de acces este invalid")
		return
	}
	startsAt, err := time.Parse(time.RFC3339, req.StartsAt)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Ora de inceput este invalida")
		return
	}
	endsAt, err := time.Parse(time.RFC3339, req.EndsAt)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Ora de sfarsit este invalida")
		return
	}
	if !endsAt.After(startsAt) || startsAt.Before(event.StartTime.Time) || endsAt.After(event.EndTime.Time) {
		router.RespondWithError(w, http.StatusBadRequest, "Intervalul trebuie sa fie inclus in perioada evenimentului")
		return
	}

	plainToken, hashedToken, err := auth.GenerateSecureToken()
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Linkul temporar nu a putut fi generat")
		return
	}
	access, err := h.Queries.CreateScannerAccess(ctx, db.CreateScannerAccessParams{
		EventID:   eventID,
		CreatedBy: userID,
		Label:     req.Label,
		TokenHash: hashedToken,
		StartsAt:  pgtype.Timestamptz{Time: startsAt, Valid: true},
		EndsAt:    pgtype.Timestamptz{Time: endsAt, Valid: true},
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Linkul temporar nu a putut fi salvat")
		return
	}

	publicAppURL := h.PublicAppURL
	if publicAppURL == "" {
		publicAppURL = "http://localhost:3000"
	}
	response := CreateScannerAccessResponse{
		ScannerAccessResponse: ScannerAccessResponse{
			ID:        common.UUIDToString(access.ID),
			Label:     access.Label,
			StartsAt:  common.TimestampToString(access.StartsAt),
			EndsAt:    common.TimestampToString(access.EndsAt),
			RevokedAt: common.TimestampToString(access.RevokedAt),
			CreatedAt: common.TimestampToString(access.CreatedAt),
		},
		URL: fmt.Sprintf("%s/scan?token=%s", publicAppURL, url.QueryEscape(plainToken)),
	}
	router.RespondWithJSON(w, http.StatusCreated, response)
}

func (h *Handler) HandleListScannerAccess(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDString, err := auth.GetUserIDFromContext(ctx)
	if err != nil || userIDString == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	var userID, eventID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return
	}
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}
	isManager, err := h.isEventManager(ctx, eventID, userID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	}
	if !isManager {
		router.RespondWithError(w, http.StatusForbidden, "Doar organizatorul poate vedea linkurile de scanare")
		return
	}

	accesses, err := h.Queries.ListScannerAccess(ctx, eventID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Linkurile de scanare nu au putut fi incarcate")
		return
	}
	result := make([]ScannerAccessResponse, 0, len(accesses))
	for _, access := range accesses {
		result = append(result, MapScannerAccess(access))
	}
	router.RespondWithJSON(w, http.StatusOK, result)
}

func (h *Handler) HandleRevokeScannerAccess(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDString, err := auth.GetUserIDFromContext(ctx)
	if err != nil || userIDString == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	var userID, eventID, accessID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return
	}
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}
	if err := accessID.Scan(chi.URLParam(r, "accessId")); err != nil || !accessID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul linkului este invalid")
		return
	}
	isManager, err := h.isEventManager(ctx, eventID, userID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	}
	if !isManager {
		router.RespondWithError(w, http.StatusForbidden, "Doar organizatorul poate revoca linkuri de scanare")
		return
	}
	if err := h.Queries.RevokeScannerAccess(ctx, db.RevokeScannerAccessParams{ID: accessID, EventID: eventID}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Linkul de scanare nu a putut fi revocat")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) HandleCreateScannerSession(w http.ResponseWriter, r *http.Request) {
	var req CreateScannerSessionRequest
	if !router.DecodeJSON(w, r, &req, 4<<10) {
		return
	}
	req.Token = strings.TrimSpace(req.Token)
	if len(req.Token) != 64 {
		router.RespondWithError(w, http.StatusUnauthorized, "Linkul de scanare este invalid")
		return
	}

	access, err := h.Queries.GetScannerAccessByTokenHash(r.Context(), auth.HashPlainToken(req.Token))
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Linkul de scanare este invalid")
		return
	}
	now := time.Now()
	if access.RevokedAt.Valid || now.Before(access.StartsAt.Time) || !now.Before(access.EndsAt.Time) {
		router.RespondWithError(w, http.StatusForbidden, "Linkul de scanare nu este activ in acest interval")
		return
	}

	jwtSecret, err := auth.JWTSigningKey()
	if err != nil {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Sesiunea de scanare nu este configurata")
		return
	}
	session := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"scope":             "scanner",
		"scanner_access_id": common.UUIDToString(access.ID),
		"event_id":          common.UUIDToString(access.EventID),
		"exp":               access.EndsAt.Time.Unix(),
		"iat":               now.Unix(),
	})
	sessionToken, err := session.SignedString(jwtSecret)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Sesiunea de scanare nu a putut fi generata")
		return
	}
	router.RespondWithJSON(w, http.StatusOK, ScannerSessionResponse{
		SessionToken: sessionToken,
		Label:        access.Label,
		EventTitle:   access.EventTitle,
		LocationName: access.LocationName,
		ExpiresAt:    common.TimestampToString(access.EndsAt),
	})
}

func (h *Handler) HandleQuickValidateTicket(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	accessIDString, accessErr := auth.GetScannerAccessIDFromContext(ctx)
	eventIDString, eventErr := auth.GetScannerEventIDFromContext(ctx)
	if accessErr != nil || eventErr != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Sesiunea de scanare este invalida")
		return
	}

	var accessID, eventID pgtype.UUID
	if err := accessID.Scan(accessIDString); err != nil || !accessID.Valid {
		router.RespondWithError(w, http.StatusUnauthorized, "Sesiunea de scanare este invalida")
		return
	}
	if err := eventID.Scan(eventIDString); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusUnauthorized, "Sesiunea de scanare este invalida")
		return
	}

	access, err := h.Queries.GetScannerAccessByID(ctx, accessID)
	if err != nil || access.EventID != eventID || access.RevokedAt.Valid || time.Now().Before(access.StartsAt.Time) || !time.Now().Before(access.EndsAt.Time) {
		router.RespondWithError(w, http.StatusForbidden, "Accesul temporar de scanare nu mai este activ")
		return
	}

	var req ValidateTicketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid")
		return
	}
	response, statusCode, message := h.validateTicketForEvent(ctx, eventID, req.ValidationHash, pgtype.UUID{}, accessID)
	if message != "" {
		router.RespondWithError(w, statusCode, message)
		return
	}
	router.RespondWithJSON(w, statusCode, response)
}

func (h *Handler) HandleCreateOfflineSnapshot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDString, err := auth.GetUserIDFromContext(ctx)
	if err != nil || userIDString == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var userID, eventID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return
	}
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}

	event, allowed, err := h.canValidateEvent(ctx, eventID, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Permisiunile de validare nu au putut fi verificate")
		return
	}
	if !allowed {
		router.RespondWithError(w, http.StatusForbidden, "Nu ai permisiunea sa pregatesti validarea offline pentru acest eveniment")
		return
	}
	if !event.EndTime.Valid || !time.Now().Before(event.EndTime.Time) {
		router.RespondWithError(w, http.StatusBadRequest, "Evenimentul s-a terminat si nu mai poate fi pregatit offline")
		return
	}

	tickets, err := h.Queries.ListOfflineValidationTickets(ctx, eventID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Biletele pentru validare offline nu au putut fi incarcate")
		return
	}
	responseTickets := make([]OfflineTicketSnapshot, 0, len(tickets))
	for _, ticket := range tickets {
		responseTickets = append(responseTickets, OfflineTicketSnapshot{TicketID: common.UUIDToString(ticket.ID), ValidationHash: ticket.ValidationHash, TicketType: ticket.TicketTypeName})
	}
	invitationRows, err := h.Queries.ListOfflineInvitationTickets(ctx, eventID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Invitatiile offline nu au putut fi incarcate")
		return
	}
	for _, invitation := range invitationRows {
		responseTickets = append(responseTickets, OfflineTicketSnapshot{TicketID: common.UUIDToString(invitation.ID), ValidationHash: invitation.ValidationHash, TicketType: invitation.TicketTypeName})
	}
	snapshot, err := h.Queries.CreateOfflineValidationSnapshot(ctx, db.CreateOfflineValidationSnapshotParams{
		EventID:         eventID,
		CreatedByUserID: userID,
		TicketCount:     int32(len(responseTickets)),
		ExpiresAt:       event.EndTime,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Pachetul offline nu a putut fi pregatit")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, OfflineValidationSnapshotResponse{
		SnapshotID:  common.UUIDToString(snapshot.ID),
		EventID:     common.UUIDToString(eventID),
		EventTitle:  event.Title,
		GeneratedAt: common.TimestampToString(snapshot.CreatedAt),
		ExpiresAt:   common.TimestampToString(snapshot.ExpiresAt),
		TicketCount: snapshot.TicketCount,
		Tickets:     responseTickets,
	})
}

func offlineSyncResultFromStored(row db.GetOfflineTicketValidationByClientScanIDRow) OfflineTicketSyncResult {
	return OfflineTicketSyncResult{
		ClientScanID: common.UUIDToString(row.ClientScanID),
		Status:       row.Result,
		TicketID:     common.UUIDToString(row.TicketID),
		TicketType:   row.TicketType,
		EventTitle:   row.EventTitle,
		ValidatedAt:  common.TimestampToString(row.ServerValidatedAt),
	}
}

func (h *Handler) syncOfflineTicketScan(ctx context.Context, eventID, userID, snapshotID pgtype.UUID, deviceID string, scan OfflineTicketScanPayload) (OfflineTicketSyncResult, error) {
	var clientScanID pgtype.UUID
	if err := clientScanID.Scan(scan.ClientScanID); err != nil || !clientScanID.Valid {
		return OfflineTicketSyncResult{}, fmt.Errorf("client scan id invalid")
	}
	scannedAt, err := time.Parse(time.RFC3339, scan.ScannedAt)
	if err != nil {
		return OfflineTicketSyncResult{}, fmt.Errorf("scan time invalid")
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return OfflineTicketSyncResult{}, err
	}
	defer tx.Rollback(ctx)
	qtx := h.Queries.WithTx(tx)

	auditID, err := qtx.CreateOfflineTicketValidation(ctx, db.CreateOfflineTicketValidationParams{
		ClientScanID:      clientScanID,
		SnapshotID:        snapshotID,
		EventID:           eventID,
		ValidatedByUserID: userID,
		DeviceID:          deviceID,
		ValidationHash:    strings.TrimSpace(scan.ValidationHash),
		ScannedAt:         pgtype.Timestamptz{Time: scannedAt, Valid: true},
	})
	if errors.Is(err, pgx.ErrNoRows) {
		stored, storedErr := qtx.GetOfflineTicketValidationByClientScanID(ctx, db.GetOfflineTicketValidationByClientScanIDParams{
			ClientScanID:      clientScanID,
			EventID:           eventID,
			ValidatedByUserID: userID,
		})
		if storedErr != nil {
			return OfflineTicketSyncResult{}, storedErr
		}
		if err := tx.Commit(ctx); err != nil {
			return OfflineTicketSyncResult{}, err
		}
		return offlineSyncResultFromStored(stored), nil
	}
	if err != nil {
		return OfflineTicketSyncResult{}, err
	}

	result := OfflineTicketSyncResult{ClientScanID: scan.ClientScanID}
	if invitation, handled, invitationErr := h.validateInvitation(ctx, eventID, strings.TrimSpace(scan.ValidationHash)); invitationErr != nil {
		return OfflineTicketSyncResult{}, invitationErr
	} else if handled {
		result.Status, _ = invitation["status"].(string)
		result.TicketType, _ = invitation["ticketType"].(string)
		if result.Status == "valid" {
			result.Status = "accepted"
		}
		if err := qtx.CompleteOfflineTicketValidation(ctx, db.CompleteOfflineTicketValidationParams{ID: auditID, Result: result.Status}); err != nil {
			return OfflineTicketSyncResult{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return OfflineTicketSyncResult{}, err
		}
		return result, nil
	}
	validationHash, validHash := parseValidationHash(scan.ValidationHash)
	if !validHash {
		result.Status = "invalid"
	} else {
		ticket, ticketErr := qtx.GetTicketByHash(ctx, validationHash)
		if errors.Is(ticketErr, pgx.ErrNoRows) {
			result.Status = "invalid"
		} else if ticketErr != nil {
			return OfflineTicketSyncResult{}, ticketErr
		} else if ticket.EventID != eventID {
			result.Status = "wrong_event"
			result.TicketID = common.UUIDToString(ticket.ID)
			result.TicketType = ticket.TicketTypeName
			result.EventTitle = ticket.EventTitle
		} else {
			result.TicketID = common.UUIDToString(ticket.ID)
			result.TicketType = ticket.TicketTypeName
			result.EventTitle = ticket.EventTitle
			if ticket.IsValidated {
				result.Status = "already_validated"
				result.ValidatedAt = common.TimestampToString(ticket.ValidatedAt)
			} else {
				validatedAt, validationErr := qtx.ValidateTicketOnce(ctx, db.ValidateTicketOnceParams{
					ID:                         ticket.ID,
					ValidatedByUserID:          userID,
					ValidatedByScannerAccessID: pgtype.UUID{},
				})
				if errors.Is(validationErr, pgx.ErrNoRows) {
					result.Status = "already_validated"
				} else if validationErr != nil {
					return OfflineTicketSyncResult{}, validationErr
				} else {
					result.Status = "accepted"
					result.ValidatedAt = common.TimestampToString(validatedAt)
				}
			}
		}
	}

	var ticketID pgtype.UUID
	if result.TicketID != "" {
		_ = ticketID.Scan(result.TicketID)
	}
	var validatedAt pgtype.Timestamptz
	if result.ValidatedAt != "" {
		if parsed, parseErr := time.Parse(time.RFC3339, result.ValidatedAt); parseErr == nil {
			validatedAt = pgtype.Timestamptz{Time: parsed, Valid: true}
		}
	}
	if err := qtx.CompleteOfflineTicketValidation(ctx, db.CompleteOfflineTicketValidationParams{
		ID:                auditID,
		TicketID:          ticketID,
		Result:            result.Status,
		ServerValidatedAt: validatedAt,
	}); err != nil {
		return OfflineTicketSyncResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return OfflineTicketSyncResult{}, err
	}
	return result, nil
}

func (h *Handler) HandleSyncOfflineScans(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDString, err := auth.GetUserIDFromContext(ctx)
	if err != nil || userIDString == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	var userID, eventID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return
	}
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}
	_, allowed, err := h.canValidateEvent(ctx, eventID, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Permisiunile de validare nu au putut fi verificate")
		return
	}
	if !allowed {
		router.RespondWithError(w, http.StatusForbidden, "Nu ai permisiunea sa sincronizezi bilete pentru acest eveniment")
		return
	}

	var req SyncOfflineTicketScansRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid")
		return
	}
	req.DeviceID = strings.TrimSpace(req.DeviceID)
	if req.DeviceID == "" || len(req.DeviceID) > 128 || len(req.Scans) == 0 || len(req.Scans) > 200 {
		router.RespondWithError(w, http.StatusBadRequest, "Pachetul de sincronizare este invalid")
		return
	}
	var snapshotID pgtype.UUID
	if err := snapshotID.Scan(req.SnapshotID); err != nil || !snapshotID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "Snapshot-ul offline este invalid")
		return
	}
	snapshot, err := h.Queries.GetOfflineValidationSnapshotForSync(ctx, db.GetOfflineValidationSnapshotForSyncParams{ID: snapshotID, EventID: eventID, CreatedByUserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusForbidden, "Snapshot-ul offline nu apartine acestui cont")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Snapshot-ul offline nu a putut fi verificat")
		return
	}
	if !time.Now().Before(snapshot.ExpiresAt.Time) {
		router.RespondWithError(w, http.StatusBadRequest, "Snapshot-ul offline a expirat")
		return
	}

	results := make([]OfflineTicketSyncResult, 0, len(req.Scans))
	for _, scan := range req.Scans {
		result, syncErr := h.syncOfflineTicketScan(ctx, eventID, userID, snapshotID, req.DeviceID, scan)
		if syncErr != nil {
			router.RespondWithError(w, http.StatusBadRequest, "O scanare offline are date invalide")
			return
		}
		results = append(results, result)
	}
	router.RespondWithJSON(w, http.StatusOK, SyncOfflineTicketScansResponse{Results: results})
}

func (h *Handler) validateTicketForEvent(ctx context.Context, eventID pgtype.UUID, validationHash string, validatedByUserID, validatedByScannerAccessID pgtype.UUID) (TicketValidationResponse, int, string) {
	var valid bool
	validationHash, valid = parseValidationHash(validationHash)
	if !valid {
		return TicketValidationResponse{}, http.StatusBadRequest, "Codul biletului este invalid"
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return TicketValidationResponse{}, http.StatusInternalServerError, "Eroare la initializarea validarii"
	}
	defer tx.Rollback(ctx)

	qtx := h.Queries.WithTx(tx)
	ticketRow, err := qtx.GetTicketByHash(ctx, validationHash)
	if err != nil {
		return TicketValidationResponse{}, http.StatusNotFound, "Biletul nu este valid sau nu exista in sistem"
	}
	if ticketRow.EventID != eventID {
		return TicketValidationResponse{}, http.StatusNotFound, "Biletul nu apartine acestui eveniment"
	}
	if ticketRow.IsValidated {
		response := MapTicketValidationResponse(ticketRow)
		response.Status = "already_validated"
		return response, http.StatusOK, ""
	}

	validatedAt, err := qtx.ValidateTicketOnce(ctx, db.ValidateTicketOnceParams{
		ID:                         ticketRow.ID,
		ValidatedByUserID:          validatedByUserID,
		ValidatedByScannerAccessID: validatedByScannerAccessID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		response := MapTicketValidationResponse(ticketRow)
		response.Status = "already_validated"
		return response, http.StatusOK, ""
	}
	if err != nil {
		return TicketValidationResponse{}, http.StatusInternalServerError, "Biletul nu a putut fi validat"
	}
	if err := tx.Commit(ctx); err != nil {
		return TicketValidationResponse{}, http.StatusInternalServerError, "Validarea nu a putut fi salvata"
	}

	response := MapTicketValidationResponse(ticketRow)
	response.Status = "valid"
	response.ValidatedAt = common.TimestampToString(validatedAt)
	return response, http.StatusOK, ""
}

func (h *Handler) HandleValidateTicket(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDString, err := auth.GetUserIDFromContext(ctx)
	if err != nil || userIDString == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var userID, eventID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return
	}
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}

	event, err := h.Queries.GetEventWithStats(ctx, eventID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	}
	if event.OrganizerID != userID {
		isStaff, err := h.Queries.IsValidationStaffForEvent(ctx, db.IsValidationStaffForEventParams{EventID: eventID, UserID: userID})
		if err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Permisiunile de validare nu au putut fi verificate")
			return
		}
		if !isStaff {
			router.RespondWithError(w, http.StatusForbidden, "Nu ai permisiunea sa validezi bilete pentru acest eveniment")
			return
		}
	}

	var req ValidateTicketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	req.ValidationHash = strings.TrimSpace(req.ValidationHash)
	if len(req.ValidationHash) != 64 {
		router.RespondWithError(w, http.StatusBadRequest, "Codul biletului este invalid")
		return
	}
	if req.ValidationHash == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Hash-ul de validare lipsește")
		return
	}
	if _, err := hex.DecodeString(req.ValidationHash); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Codul biletului este invalid")
		return
	}

	if invitation, handled, err := h.validateInvitation(ctx, eventID, req.ValidationHash); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Invitatia nu a putut fi validata")
		return
	} else if handled {
		router.RespondWithJSON(w, http.StatusOK, invitation)
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la inițierea tranzacției: "+err.Error())
		return
	}
	defer tx.Rollback(ctx)

	qtx := h.Queries.WithTx(tx)

	ticketRow, err := qtx.GetTicketByHash(ctx, req.ValidationHash)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Biletul nu este valid sau nu există în sistem")
		return
	}
	if ticketRow.EventID != eventID {
		router.RespondWithError(w, http.StatusNotFound, "Biletul nu apartine acestui eveniment")
		return
	}

	// Check if the ticket has already been validated
	if ticketRow.IsValidated {

		res := MapTicketValidationResponse(ticketRow)
		res.Status = "already_validated"
		router.RespondWithJSON(w, http.StatusOK, res)
		return
	}

	validatedAt, err := qtx.ValidateTicketOnce(ctx, db.ValidateTicketOnceParams{
		ID:                         ticketRow.ID,
		ValidatedByUserID:          userID,
		ValidatedByScannerAccessID: pgtype.UUID{},
	})
	if errors.Is(err, pgx.ErrNoRows) {
		res := MapTicketValidationResponse(ticketRow)
		res.Status = "already_validated"
		router.RespondWithJSON(w, http.StatusOK, res)
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la procesarea validării biletului: "+err.Error())
		return
	}

	if err := tx.Commit(ctx); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la salvarea validării: "+err.Error())
		return
	}

	res := MapTicketValidationResponse(ticketRow)
	res.Status = "valid"
	res.ValidatedAt = common.TimestampToString(validatedAt)

	router.RespondWithJSON(w, http.StatusOK, res)
}

type TicketTypeInput struct {
	Name        string `json:"name"`
	PriceRon    int32  `json:"priceRon"`
	Capacity    int32  `json:"capacity"`
	StartSales  string `json:"startSales"`
	EndSales    string `json:"endSales"`
	Description string `json:"description"`
	EventID     string `json:"eventId"`
}

func (h *Handler) HandleCreateTicketType(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDStr, err := auth.GetUserIDFromContext(ctx)
	if err != nil || userIDStr == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var userID pgtype.UUID
	if err := userID.Scan(userIDStr); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return
	}

	var req TicketTypeInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Date invalide")
		return
	}
	if req.PriceRon < 0 {
		router.RespondWithError(w, http.StatusBadRequest, "Pretul biletului nu poate fi negativ")
		return
	}

	var eventID pgtype.UUID
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}

	event, err := h.Queries.GetEventWithStats(ctx, eventID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	}
	if common.UUIDToString(event.OrganizerID) != userIDStr {
		router.RespondWithError(w, http.StatusForbidden, "Nu ai permisiunea sa adaugi bilete acestui eveniment")
		return
	}
	if event.ExternalTicketUrl.Valid {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul foloseste o platforma externa pentru bilete")
		return
	}

	profile, err := h.Queries.GetOrganizerProfile(ctx, userID)
	if err != nil || !organizer.IsVerified(profile) {
		router.RespondWithError(w, http.StatusForbidden, "Firma organizatorului trebuie validata inainte de a adauga bilete")
		return
	}
	if req.PriceRon > 0 && !organizer.CanSellTickets(profile) {
		router.RespondWithError(w, http.StatusForbidden, "Configureaza Stripe inainte de a adauga bilete")
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la pregatirea tipului de bilet")
		return
	}
	defer tx.Rollback(ctx)
	var lockedExternalURL pgtype.Text
	if err := tx.QueryRow(ctx, `
		SELECT external_ticket_url
		FROM events
		WHERE id = $1 AND organizer_id = $2
		FOR SHARE`, eventID, userID).Scan(&lockedExternalURL); err != nil {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul nu mai poate fi modificat")
		return
	}
	if lockedExternalURL.Valid {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul foloseste o platforma externa pentru bilete")
		return
	}

	qtx := h.Queries.WithTx(tx)
	err = qtx.CreateTicketType(ctx, db.CreateTicketTypeParams{
		EventID:     eventID,
		Name:        req.Name,
		PriceRon:    req.PriceRon,
		Capacity:    req.Capacity,
		StartSales:  func() pgtype.Timestamptz { var t pgtype.Timestamptz; _ = t.Scan(req.StartSales); return t }(),
		EndSales:    func() pgtype.Timestamptz { var t pgtype.Timestamptz; _ = t.Scan(req.EndSales); return t }(),
		Description: func() pgtype.Text { var t pgtype.Text; _ = t.Scan(req.Description); return t }(),
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la crearea tipului de bilet: "+err.Error())
		return
	}
	if err := tx.Commit(ctx); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la salvarea tipului de bilet")
		return
	}
	router.RespondWithJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

// Generare hash securizat bazat pe datele comenzii și un timestamp de microsecunde
func generateSecureValidationHash(email string, orderID pgtype.UUID, index int32) string {
	var idBytes [16]byte
	if orderID.Valid {
		idBytes = orderID.Bytes
	}
	data := fmt.Sprintf("%s-%x-%d-%d", email, idBytes, index, time.Now().UnixNano())
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:])
}
