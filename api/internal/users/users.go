package users

import (
	"encoding/json"
	"net/http"

	db "pulse-api/db/generated"
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
	Username  string `json:"username"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	AvatarUrl string `json:"avatarUrl"`
	Bio       string `json:"bio"`
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

	updated, err := h.Queries.UpdateUserProfile(r.Context(), db.UpdateUserProfileParams{
		ID:      uuid,
		Column2: req.Username,  // username
		Column3: req.Email,     // email
		Column4: req.Role,      // role
		Column5: req.AvatarUrl, // avatar_url
		Bio:     pgtype.Text{String: req.Bio, Valid: req.Bio != ""},
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la actualizarea profilului")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, MapUpdateUserProfileRow(updated))
}

func (h *Handler) HandleCreateUser(w http.ResponseWriter, r *http.Request) {
	var params db.CreateUserParams
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	user, err := h.Queries.CreateUser(r.Context(), params)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Nu s-a putut crea utilizatorul: "+err.Error())
		return
	}

	router.RespondWithJSON(w, http.StatusCreated, MapUser(user))
}

func (h *Handler) HandleGetUser(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")

	var uuid pgtype.UUID
	err := uuid.Scan(idStr)
	if err != nil || !uuid.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul (UUID) furnizat este invalid")
		return
	}

	user, err := h.Queries.GetUserByID(r.Context(), uuid)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Utilizatorul nu a fost găsit")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, MapUser(user))
}
