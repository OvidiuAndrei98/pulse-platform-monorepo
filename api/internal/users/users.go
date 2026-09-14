package users

import (
	"encoding/json"
	"net/http"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/router"

	"github.com/jackc/pgx/v5/pgtype"
)

type Handler struct {
	Queries *db.Queries
}

func NewHandler(queries *db.Queries) *Handler {
	return &Handler{Queries: queries}
}

func (h *Handler) HandleGetMe(w http.ResponseWriter, r *http.Request) {
	userIDStr, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var uuid pgtype.UUID
	if err := uuid.Scan(userIDStr); err != nil || !uuid.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID utilizator invalid în token")
		return
	}

	user, err := h.Queries.GetUserByID(r.Context(), uuid)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Utilizatorul nu a fost găsit")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, MapUser(user))
}

type UpdateMeRequest struct {
	Username               string  `json:"username"`
	Bio                    *string `json:"bio"`
	PreferredLanguage      string  `json:"preferredLanguage"`
	ShowAttendancePublicly *bool   `json:"showAttendancePublicly"`
}

func (h *Handler) HandleUpdateMe(w http.ResponseWriter, r *http.Request) {
	userIDStr, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var uuid pgtype.UUID
	if err := uuid.Scan(userIDStr); err != nil || !uuid.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID utilizator invalid în token")
		return
	}

	var req UpdateMeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid")
		return
	}
	if len(req.Username) > 0 && (len(req.Username) < 3 || len(req.Username) > 50) {
		router.RespondWithError(w, http.StatusBadRequest, "Username-ul trebuie sa aiba intre 3 si 50 de caractere")
		return
	}
	if req.Bio != nil && len(*req.Bio) > 500 {
		router.RespondWithError(w, http.StatusBadRequest, "Bio-ul poate avea cel mult 500 de caractere")
		return
	}
	if req.PreferredLanguage != "" && req.PreferredLanguage != "en" && req.PreferredLanguage != "ro" {
		router.RespondWithError(w, http.StatusBadRequest, "Limba selectata este invalida")
		return
	}

	bio := pgtype.Text{}
	if req.Bio != nil {
		bio = pgtype.Text{String: *req.Bio, Valid: true}
	}
	showAttendancePublicly := pgtype.Bool{}
	if req.ShowAttendancePublicly != nil {
		showAttendancePublicly = pgtype.Bool{Bool: *req.ShowAttendancePublicly, Valid: true}
	}

	updated, err := h.Queries.UpdateUserProfile(r.Context(), db.UpdateUserProfileParams{
		ID:                     uuid,
		Column2:                req.Username,
		Bio:                    bio,
		PreferredLanguage:      req.PreferredLanguage,
		ShowAttendancePublicly: showAttendancePublicly,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la actualizarea profilului")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, MapUpdateUserProfileRow(updated))
}
