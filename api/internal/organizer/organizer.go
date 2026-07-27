package organizer

import (
	"encoding/json"
	"net"
	"net/http"
	"net/netip"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/anaf"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const AgreementVersion = "2026-07-27"

type Handler struct {
	Queries *db.Queries
}

func NewHandler(queries *db.Queries) *Handler {
	return &Handler{Queries: queries}
}

type FinanceEventResponse struct {
	EventID         string `json:"eventId"`
	EventTitle      string `json:"eventTitle"`
	StartTime       string `json:"startTime"`
	GrossRevenueRon int64  `json:"grossRevenueRon"`
	PlatformFeeBani int64  `json:"platformFeeBani"`
	TicketsSold     int64  `json:"ticketsSold"`
}

func (h *Handler) HandleGetOrganizerFinance(w http.ResponseWriter, r *http.Request) {
	userIDString, err := auth.GetUserIDFromContext(r.Context())
	if err != nil || userIDString == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var organizerID pgtype.UUID
	if err := organizerID.Scan(userIDString); err != nil || !organizerID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul organizatorului este invalid")
		return
	}

	rows, err := h.Queries.ListOrganizerFinanceEvents(r.Context(), organizerID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Situatia financiara nu a putut fi incarcata")
		return
	}

	result := make([]FinanceEventResponse, 0, len(rows))
	for _, row := range rows {
		result = append(result, FinanceEventResponse{
			EventID:         common.UUIDToString(row.EventID),
			EventTitle:      row.EventTitle,
			StartTime:       common.TimestampToString(row.StartTime),
			GrossRevenueRon: row.GrossRevenueRon,
			PlatformFeeBani: row.PlatformFeeBani,
			TicketsSold:     row.TicketsSold,
		})
	}

	router.RespondWithJSON(w, http.StatusOK, result)
}

type CreateOrganizerProfileRequest struct {
	Cui                       string `json:"cui"`
	CompanyName               string `json:"companyName"`
	UserID                    string `json:"userId"`
	OrganizerAgreementVersion string `json:"organizerAgreementVersion"`
}

type AcceptOrganizerAgreementRequest struct {
	Version string `json:"version"`
}

func (h *Handler) HandleCreateOrganizerProfile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req CreateOrganizerProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}
	if req.OrganizerAgreementVersion != AgreementVersion {
		router.RespondWithError(w, http.StatusBadRequest, "Acordul pentru organizatori trebuie acceptat inainte de verificare")
		return
	}

	// 1. Extragerea ID-ului din Context (baza middleware-ului tău JWT)
	userIDStr, err := auth.GetUserIDFromContext(r.Context())
	if err != nil || userIDStr == "" {
		// FALLBACK TEMPORAR: Dacă încă testezi fără JWT middleware, lasă linia de mai jos:
		userIDStr = req.UserID

		if userIDStr == "" {
			router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat sau ID lipsă")
			return
		}
	}

	// 2. Validare ID în format pgtype.UUID
	var uuid pgtype.UUID
	if err := uuid.Scan(userIDStr); err != nil || !uuid.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului nu este un UUID valid")
		return
	}

	// 3. Interogare API Proxy ANAF
	company, err := anaf.Lookup(ctx, req.Cui, req.CompanyName)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Failed to lookup company: "+err.Error())
		return
	}

	verificationStatus := db.VerificationStatusTypeApproved

	if !company.IsActive {
		verificationStatus = db.VerificationStatusTypePending
	}

	params := db.CreateOrganizerProfileParams{
		UserID:                       uuid,
		Cui:                          req.Cui,
		CompanyName:                  company.Name,
		FiscalAddress:                company.Address,
		IsVerified:                   pgtype.Bool{Bool: company.IsActive, Valid: true},
		VerifiedAt:                   pgtype.Timestamptz{Time: time.Now(), Valid: true},
		VerificationStatus:           verificationStatus,
		OrganizerAgreementVersion:    pgtype.Text{String: AgreementVersion, Valid: true},
		OrganizerAgreementAcceptedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
		OrganizerAgreementAcceptedIp: acceptedIP(r),
	}

	profile, err := h.Queries.CreateOrganizerProfile(ctx, params)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la crearea profilului organizatorului: "+err.Error())
		return
	}

	router.RespondWithJSON(w, http.StatusCreated, MapOrganizerProfile(profile))
}

func (h *Handler) HandleAcceptOrganizerAgreement(w http.ResponseWriter, r *http.Request) {
	userIDString, err := auth.GetUserIDFromContext(r.Context())
	if err != nil || userIDString == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var req AcceptOrganizerAgreementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid")
		return
	}
	if req.Version != AgreementVersion {
		router.RespondWithError(w, http.StatusBadRequest, "Versiunea acordului este invalida")
		return
	}

	var userID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului este invalid")
		return
	}

	profile, err := h.Queries.AcceptOrganizerAgreement(r.Context(), db.AcceptOrganizerAgreementParams{
		UserID:                       userID,
		OrganizerAgreementVersion:    pgtype.Text{String: AgreementVersion, Valid: true},
		OrganizerAgreementAcceptedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
		OrganizerAgreementAcceptedIp: acceptedIP(r),
	})
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Completeaza mai intai profilul firmei")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, MapOrganizerProfile(profile))
}

func acceptedIP(r *http.Request) *netip.Addr {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip, err := netip.ParseAddr(host)
	if err != nil {
		return nil
	}
	return &ip
}

func (h *Handler) HandleGetOrganizerProfile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	userIDStr := chi.URLParam(r, "id")
	if userIDStr == "" {
		// Fallback în caz că ruta folosește variabila {userId} în loc de {id}
		userIDStr = chi.URLParam(r, "userId")
	}

	var userID pgtype.UUID
	if err := userID.Scan(userIDStr); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul utilizatorului din URL este invalid")
		return
	}

	profile, err := h.Queries.GetOrganizerProfile(ctx, userID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Profilul organizatorului nu a fost găsit")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, MapOrganizerProfile(profile))
}

func (h *Handler) HandleGetOrganizerByCUI(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	profile, err := h.Queries.GetOrganizerByCUI(ctx, r.URL.Query().Get("cui"))
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Profilul organizatorului nu a fost găsit")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, MapOrganizerProfile(profile))
}
