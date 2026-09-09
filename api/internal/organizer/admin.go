package organizer

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type VerificationRequestResponse struct {
	UserID             string `json:"userId"`
	Username           string `json:"username"`
	Email              string `json:"email"`
	Cui                string `json:"cui"`
	CompanyName        string `json:"companyName"`
	FiscalAddress      string `json:"fiscalAddress,omitempty"`
	VerificationStatus string `json:"verificationStatus"`
	SubmittedAt        string `json:"submittedAt"`
	UpdatedAt          string `json:"updatedAt"`
	VerifiedAt         string `json:"verifiedAt,omitempty"`
}

type ReviewVerificationRequest struct {
	Status string `json:"status"`
}

func (h *Handler) HandleAdminListOrganizerVerifications(w http.ResponseWriter, r *http.Request) {
	rows, err := h.Queries.ListOrganizerVerificationRequests(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Cererile organizatorilor nu au putut fi incarcate")
		return
	}

	result := make([]VerificationRequestResponse, 0, len(rows))
	for _, row := range rows {
		result = append(result, VerificationRequestResponse{
			UserID:             common.UUIDToString(row.UserID),
			Username:           row.Username,
			Email:              row.Email,
			Cui:                row.Cui,
			CompanyName:        row.CompanyName,
			FiscalAddress:      row.FiscalAddress,
			VerificationStatus: string(row.VerificationStatus),
			SubmittedAt:        common.TimestampToString(row.CreatedAt),
			UpdatedAt:          common.TimestampToString(row.UpdatedAt),
			VerifiedAt:         common.TimestampToString(row.VerifiedAt),
		})
	}

	router.RespondWithJSON(w, http.StatusOK, result)
}

func (h *Handler) HandleAdminReviewOrganizerVerification(w http.ResponseWriter, r *http.Request) {
	var userID pgtype.UUID
	if err := userID.Scan(chi.URLParam(r, "id")); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul organizatorului este invalid")
		return
	}

	var req ReviewVerificationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Datele verificarii sunt invalide")
		return
	}

	status := db.VerificationStatusType(req.Status)
	if status != db.VerificationStatusTypeApproved && status != db.VerificationStatusTypeRejected {
		router.RespondWithError(w, http.StatusBadRequest, "Statusul trebuie sa fie approved sau rejected")
		return
	}

	profile, err := h.Queries.ReviewOrganizerVerification(r.Context(), db.ReviewOrganizerVerificationParams{
		UserID:             userID,
		VerificationStatus: status,
		IsVerified: pgtype.Bool{
			Bool:  status == db.VerificationStatusTypeApproved,
			Valid: true,
		},
	})
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusNotFound, "Cererea organizatorului nu a fost gasita")
		return
	}
	if err != nil {
		log.Printf("review organizer verification failed for user %s with status %s: %v", chi.URLParam(r, "id"), status, err)
		router.RespondWithError(w, http.StatusInternalServerError, "Verificarea organizatorului nu a putut fi salvata")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, MapOrganizerProfile(profile))
}
