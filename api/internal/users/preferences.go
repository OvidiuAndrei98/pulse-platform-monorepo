package users

import (
	"encoding/json"
	"net/http"
	"strings"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func preferenceUserID(r *http.Request) (pgtype.UUID, bool) {
	value, err := auth.GetUserIDFromContext(r.Context())
	var id pgtype.UUID
	if err != nil || id.Scan(value) != nil || !id.Valid {
		return id, false
	}
	return id, true
}

func (h *Handler) HandleListHiddenCategories(w http.ResponseWriter, r *http.Request) {
	id, ok := preferenceUserID(r)
	if !ok {
		router.RespondWithError(w, 401, "Utilizator neautentificat")
		return
	}
	items, err := h.Queries.ListHiddenEventCategories(r.Context(), id)
	if err != nil {
		router.RespondWithError(w, 500, "Preferintele nu au putut fi incarcate")
		return
	}
	router.RespondWithJSON(w, 200, items)
}

func (h *Handler) HandleHideCategory(w http.ResponseWriter, r *http.Request) {
	id, ok := preferenceUserID(r)
	if !ok {
		router.RespondWithError(w, 401, "Utilizator neautentificat")
		return
	}
	var body struct {
		Category string `json:"category"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || strings.TrimSpace(body.Category) == "" {
		router.RespondWithError(w, 400, "Categoria este obligatorie")
		return
	}
	if err := h.Queries.HideEventCategory(r.Context(), db.HideEventCategoryParams{UserID: id, Upper: strings.TrimSpace(body.Category)}); err != nil {
		router.RespondWithError(w, 500, "Preferinta nu a putut fi salvata")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) HandleShowCategory(w http.ResponseWriter, r *http.Request) {
	id, ok := preferenceUserID(r)
	if !ok {
		router.RespondWithError(w, 401, "Utilizator neautentificat")
		return
	}
	category := strings.TrimSpace(chi.URLParam(r, "category"))
	if category == "" {
		router.RespondWithError(w, 400, "Categoria este obligatorie")
		return
	}
	if err := h.Queries.ShowEventCategory(r.Context(), db.ShowEventCategoryParams{UserID: id, Upper: category}); err != nil {
		router.RespondWithError(w, 500, "Preferinta nu a putut fi stearsa")
		return
	}
	w.WriteHeader(204)
}
