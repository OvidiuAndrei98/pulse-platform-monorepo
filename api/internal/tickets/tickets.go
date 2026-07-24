package tickets

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/organizer"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	Queries *db.Queries
	DB      *pgxpool.Pool
}

func NewHandler(queries *db.Queries, pool *pgxpool.Pool) *Handler {
	return &Handler{
		Queries: queries,
		DB:      pool,
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
	router.RespondWithJSON(w, http.StatusOK, tickets)
}

type ValidateTicketRequest struct {
	ValidationHash string `json:"validationHash"`
}

func (h *Handler) HandleValidateTicket(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req ValidateTicketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	if req.ValidationHash == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Hash-ul de validare lipsește")
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

	// Check if the ticket has already been validated
	if ticketRow.IsValidated {

		res := MapTicketValidationResponse(ticketRow)
		res.Status = "already_validated"
		router.RespondWithJSON(w, http.StatusOK, res)
		return
	}

	err = qtx.ValidateTicket(ctx, ticketRow.ID)
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

	profile, err := h.Queries.GetOrganizerProfile(ctx, userID)
	if err != nil || !organizer.CanSellTickets(profile) {
		router.RespondWithError(w, http.StatusForbidden, "Configureaza Stripe inainte de a adauga bilete")
		return
	}

	err = h.Queries.CreateTicketType(ctx, db.CreateTicketTypeParams{
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

func (h *Handler) HandleUpdateTicketType(w http.ResponseWriter, r *http.Request) {
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

	// 1. Preluăm ID-ul biletului din URL (ex: /tickets/{id})
	ticketIDStr := chi.URLParam(r, "id")
	var ticketID pgtype.UUID
	if err := ticketID.Scan(ticketIDStr); err != nil || !ticketID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul biletului este invalid")
		return
	}

	// 2. Decodificăm datele trimise în request
	var req TicketTypeInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Date invalide: "+err.Error())
		return
	}

	// 3. Apelăm query-ul de UPDATE generat de sqlc
	err = h.Queries.UpdateTicketType(ctx, db.UpdateTicketTypeParams{
		ID:          ticketID,
		Name:        req.Name,
		PriceRon:    req.PriceRon,
		Capacity:    req.Capacity,
		StartSales:  func() pgtype.Timestamptz { var t pgtype.Timestamptz; _ = t.Scan(req.StartSales); return t }(),
		EndSales:    func() pgtype.Timestamptz { var t pgtype.Timestamptz; _ = t.Scan(req.EndSales); return t }(),
		Description: func() pgtype.Text { var t pgtype.Text; _ = t.Scan(req.Description); return t }(),
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la actualizarea tipului de bilet: "+err.Error())
		return
	}

	router.RespondWithJSON(w, http.StatusOK, map[string]string{"status": "success"})
}
