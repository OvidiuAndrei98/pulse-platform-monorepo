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

// Handler colectează dependențele specifice domeniului de utilizatori
type Handler struct {
	Queries *db.Queries
}

// NewHandler instanțiază un nou handler pentru utilizatori
func NewHandler(queries *db.Queries) *Handler {
	return &Handler{
		Queries: queries,
	}
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

	router.RespondWithJSON(w, http.StatusOK, user)
}

func (h *Handler) HandleCreateUser(w http.ResponseWriter, r *http.Request) {
	var params db.CreateUserParams
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	// Am eliminat verificarea redundantă `if params.Role == nil { params.Role = nil }`

	user, err := h.Queries.CreateUser(r.Context(), params)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Nu s-a putut crea utilizatorul: "+err.Error())
		return
	}

	router.RespondWithJSON(w, http.StatusCreated, user)
}

// HandleGetUser parsează UUID-ul din URL și interoghează baza de date
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

	router.RespondWithJSON(w, http.StatusOK, user)
}
