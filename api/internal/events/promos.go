package events

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"pulse-api/internal/auth"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

var promoCodePattern = regexp.MustCompile(`^[A-Z0-9_-]{3,40}$`)

type promoCodeResponse struct {
	ID               string     `json:"id"`
	Code             string     `json:"code"`
	DiscountPercent  int32      `json:"discountPercent"`
	MaxRedemptions   *int32     `json:"maxRedemptions,omitempty"`
	RedemptionsCount int32      `json:"redemptionsCount"`
	StartsAt         *time.Time `json:"startsAt,omitempty"`
	EndsAt           *time.Time `json:"endsAt,omitempty"`
	Active           bool       `json:"active"`
	CreatedAt        time.Time  `json:"createdAt"`
}

func (h *Handler) organizerOwnsEvent(r *http.Request) (pgtype.UUID, bool) {
	userString, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		return pgtype.UUID{}, false
	}
	var userID, eventID pgtype.UUID
	if userID.Scan(userString) != nil || eventID.Scan(chi.URLParam(r, "id")) != nil {
		return eventID, false
	}
	event, err := h.Queries.GetEventWithStats(r.Context(), eventID)
	return eventID, err == nil && event.OrganizerID == userID
}

func optionalPromoTime(raw *string) (pgtype.Timestamptz, error) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return pgtype.Timestamptz{}, nil
	}
	parsed, err := time.Parse(time.RFC3339, *raw)
	return pgtype.Timestamptz{Time: parsed, Valid: err == nil}, err
}

func (h *Handler) HandleListPromoCodes(w http.ResponseWriter, r *http.Request) {
	eventID, ok := h.organizerOwnsEvent(r)
	if !ok {
		router.RespondWithError(w, http.StatusForbidden, "Acces interzis")
		return
	}
	rows, err := h.DB.Query(r.Context(), `SELECT id,code,discount_percent,max_redemptions,redemptions_count,starts_at,ends_at,active,created_at FROM promo_codes WHERE event_id=$1 ORDER BY created_at DESC`, eventID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Codurile promo nu au putut fi incarcate")
		return
	}
	defer rows.Close()
	items := make([]promoCodeResponse, 0)
	for rows.Next() {
		var id pgtype.UUID
		var max pgtype.Int4
		var starts, ends pgtype.Timestamptz
		var item promoCodeResponse
		if rows.Scan(&id, &item.Code, &item.DiscountPercent, &max, &item.RedemptionsCount, &starts, &ends, &item.Active, &item.CreatedAt) != nil {
			continue
		}
		item.ID = id.String()
		if max.Valid {
			value := max.Int32
			item.MaxRedemptions = &value
		}
		if starts.Valid {
			value := starts.Time
			item.StartsAt = &value
		}
		if ends.Valid {
			value := ends.Time
			item.EndsAt = &value
		}
		items = append(items, item)
	}
	router.RespondWithJSON(w, http.StatusOK, items)
}

func (h *Handler) HandleCreatePromoCode(w http.ResponseWriter, r *http.Request) {
	eventID, ok := h.organizerOwnsEvent(r)
	if !ok {
		router.RespondWithError(w, http.StatusForbidden, "Acces interzis")
		return
	}
	var body struct {
		Code            string  `json:"code"`
		DiscountPercent int32   `json:"discountPercent"`
		MaxRedemptions  *int32  `json:"maxRedemptions"`
		StartsAt        *string `json:"startsAt"`
		EndsAt          *string `json:"endsAt"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Date invalide")
		return
	}
	body.Code = strings.ToUpper(strings.TrimSpace(body.Code))
	if !promoCodePattern.MatchString(body.Code) || body.DiscountPercent < 1 || body.DiscountPercent > 90 || (body.MaxRedemptions != nil && *body.MaxRedemptions < 1) {
		router.RespondWithError(w, http.StatusBadRequest, "Codul, reducerea sau limita sunt invalide")
		return
	}
	starts, startErr := optionalPromoTime(body.StartsAt)
	ends, endErr := optionalPromoTime(body.EndsAt)
	if startErr != nil || endErr != nil || (starts.Valid && ends.Valid && !ends.Time.After(starts.Time)) {
		router.RespondWithError(w, http.StatusBadRequest, "Intervalul codului promo este invalid")
		return
	}
	var id pgtype.UUID
	err := h.DB.QueryRow(r.Context(), `INSERT INTO promo_codes(event_id,code,discount_percent,max_redemptions,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, eventID, body.Code, body.DiscountPercent, body.MaxRedemptions, starts, ends).Scan(&id)
	if err != nil {
		router.RespondWithError(w, http.StatusConflict, "Codul exista deja sau nu a putut fi creat")
		return
	}
	router.RespondWithJSON(w, http.StatusCreated, map[string]string{"id": id.String()})
}

func (h *Handler) HandleDeactivatePromoCode(w http.ResponseWriter, r *http.Request) {
	eventID, ok := h.organizerOwnsEvent(r)
	if !ok {
		router.RespondWithError(w, http.StatusForbidden, "Acces interzis")
		return
	}
	result, err := h.DB.Exec(r.Context(), `UPDATE promo_codes SET active=FALSE WHERE id=$1 AND event_id=$2 AND active=TRUE`, chi.URLParam(r, "promoId"), eventID)
	if err != nil || result.RowsAffected() == 0 {
		router.RespondWithError(w, http.StatusNotFound, "Codul promo nu a fost gasit")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
