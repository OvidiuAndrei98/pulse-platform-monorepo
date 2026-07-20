package organizer

import (
	"encoding/json"
	"net/http"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/anaf"
	"pulse-api/internal/auth"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type Handler struct {
	Queries *db.Queries
}

func NewHandler(queries *db.Queries) *Handler {
	return &Handler{Queries: queries}
}

type CreateOrganizerProfileRequest struct {
	Cui         string `json:"cui"`
	CompanyName string `json:"companyName"`
	UserID      string `json:"userId"`
}

func (h *Handler) HandleCreateOrganizerProfile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req CreateOrganizerProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
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
		UserID:             uuid,
		Cui:                req.Cui,
		CompanyName:        company.Name,
		FiscalAddress:      company.Address,
		IsVerified:         pgtype.Bool{Bool: company.IsActive, Valid: true},
		VerifiedAt:         pgtype.Timestamptz{Time: time.Now(), Valid: true},
		VerificationStatus: verificationStatus,
	}

	profile, err := h.Queries.CreateOrganizerProfile(ctx, params)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la crearea profilului organizatorului: "+err.Error())
		return
	}

	router.RespondWithJSON(w, http.StatusCreated, MapOrganizerProfile(profile))
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
