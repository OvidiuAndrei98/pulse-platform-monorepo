package events

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"pulse-api/internal/auth"
	"pulse-api/internal/router"
)

type eventLikeResponse struct {
	LikeCount int64 `json:"likeCount"`
	Liked     bool  `json:"liked"`
}
type eventFeedItem struct {
	ID              string    `json:"id"`
	OrganizerID     string    `json:"organizerId"`
	Title           string    `json:"title"`
	Category        string    `json:"category"`
	City            string    `json:"city"`
	LocationName    string    `json:"locationName"`
	Description     string    `json:"description"`
	BannerURL       string    `json:"bannerUrl,omitempty"`
	StartTime       time.Time `json:"startTime"`
	EndTime         time.Time `json:"endTime"`
	PriceRon        *float64  `json:"priceRon,omitempty"`
	ExternalTickets bool      `json:"externalTickets"`
	LikeCount       int64     `json:"likeCount"`
	Liked           bool      `json:"liked"`
}
type eventFeedPage struct {
	Items    []eventFeedItem `json:"items"`
	NextPage *int            `json:"nextPage,omitempty"`
}

func feedActor(r *http.Request) pgtype.UUID {
	value, err := auth.GetUserIDFromContext(r.Context())
	var id pgtype.UUID
	if err == nil {
		_ = id.Scan(value)
	}
	return id
}
func (h *Handler) feedActorActive(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) bool {
	if !actor.Valid {
		return true
	}
	var active bool
	err := h.DB.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE id=$1 AND is_active)`, actor).Scan(&active)
	if err != nil {
		router.RespondWithError(w, 503, "TEMPORARILY_UNAVAILABLE")
		return false
	}
	if !active {
		router.RespondWithError(w, 401, "SESSION_ENDED")
		return false
	}
	return true
}
func (h *Handler) HandleEventFeed(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	actor := feedActor(r)
	if !h.feedActorActive(w, r, actor) {
		return
	}
	page := 1
	if raw := r.URL.Query().Get("page"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 500 {
			router.RespondWithError(w, 400, "INVALID_PAGE")
			return
		}
		page = value
	}
	rows, err := h.DB.Query(r.Context(), `SELECT e.id::text,e.organizer_id::text,e.title,e.category,e.city,e.location_name,
      LEFT(COALESCE(e.description,''),320),COALESCE(e.banner_url,''),e.start_time,e.end_time,
      (SELECT min(tt.price_ron)::float8 FROM ticket_types tt WHERE tt.event_id=e.id AND tt.capacity>tt.tickets_sold AND tt.end_sales>CURRENT_TIMESTAMP),
      e.external_ticket_url IS NOT NULL,
      (SELECT count(*) FROM event_likes l JOIN users u ON u.id=l.user_id AND u.is_active WHERE l.event_id=e.id),
      EXISTS(SELECT 1 FROM event_likes l WHERE l.event_id=e.id AND l.user_id=$1)
      FROM events e JOIN users organizer ON organizer.id=e.organizer_id AND organizer.is_active
      WHERE e.status='published' AND e.end_time>CURRENT_TIMESTAMP
        AND NOT EXISTS(SELECT 1 FROM user_hidden_event_categories hidden WHERE hidden.user_id=$1 AND hidden.category=UPPER(e.category))
      ORDER BY e.start_time,e.id LIMIT 11 OFFSET $2`, actor, (page-1)*10)
	if err != nil {
		router.RespondWithError(w, 503, "TEMPORARILY_UNAVAILABLE")
		return
	}
	defer rows.Close()
	result := eventFeedPage{Items: []eventFeedItem{}}
	for rows.Next() {
		var item eventFeedItem
		if err = rows.Scan(&item.ID, &item.OrganizerID, &item.Title, &item.Category, &item.City, &item.LocationName, &item.Description, &item.BannerURL, &item.StartTime, &item.EndTime, &item.PriceRon, &item.ExternalTickets, &item.LikeCount, &item.Liked); err != nil {
			router.RespondWithError(w, 503, "TEMPORARILY_UNAVAILABLE")
			return
		}
		result.Items = append(result.Items, item)
	}
	if rows.Err() != nil {
		router.RespondWithError(w, 503, "TEMPORARILY_UNAVAILABLE")
		return
	}
	if len(result.Items) > 10 {
		if page < 500 {
			next := page + 1
			result.NextPage = &next
		}
		result.Items = result.Items[:10]
	}
	router.RespondWithJSON(w, 200, result)
}
func (h *Handler) HandleEventLikes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	actor := feedActor(r)
	if !h.feedActorActive(w, r, actor) {
		return
	}
	var event pgtype.UUID
	if err := event.Scan(chi.URLParam(r, "id")); err != nil || !event.Valid {
		router.RespondWithError(w, 400, "INVALID_EVENT")
		return
	}
	var result eventLikeResponse
	err := h.DB.QueryRow(r.Context(), `SELECT
      (SELECT count(*) FROM event_likes l JOIN users u ON u.id=l.user_id AND u.is_active WHERE l.event_id=e.id),
      EXISTS(SELECT 1 FROM event_likes l WHERE l.event_id=e.id AND l.user_id=$2)
      FROM events e JOIN users organizer ON organizer.id=e.organizer_id AND organizer.is_active
      WHERE e.id=$1 AND e.status='published' AND e.end_time>CURRENT_TIMESTAMP`, event, actor).Scan(&result.LikeCount, &result.Liked)
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, 404, "NOT_FOUND")
		return
	}
	if err != nil {
		router.RespondWithError(w, 503, "TEMPORARILY_UNAVAILABLE")
		return
	}
	router.RespondWithJSON(w, 200, result)
}
func (h *Handler) HandleSetEventLike(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	actor := feedActor(r)
	if !actor.Valid {
		router.RespondWithError(w, 401, "SESSION_ENDED")
		return
	}
	var event pgtype.UUID
	if err := event.Scan(chi.URLParam(r, "id")); err != nil || !event.Valid {
		router.RespondWithError(w, 400, "INVALID_EVENT")
		return
	}
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		router.RespondWithError(w, 503, "TEMPORARILY_UNAVAILABLE")
		return
	}
	defer tx.Rollback(r.Context())
	var id pgtype.UUID
	err = tx.QueryRow(r.Context(), `SELECT id FROM users WHERE id=$1 AND is_active FOR SHARE`, actor).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, 401, "SESSION_ENDED")
		return
	}
	if err == nil {
		err = tx.QueryRow(r.Context(), `SELECT e.id FROM events e JOIN users organizer ON organizer.id=e.organizer_id AND organizer.is_active
        WHERE e.id=$1 AND e.status='published' AND e.end_time>CURRENT_TIMESTAMP FOR SHARE OF e`, event).Scan(&id)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, 404, "NOT_FOUND")
		return
	}
	if err != nil {
		router.RespondWithError(w, 503, "TEMPORARILY_UNAVAILABLE")
		return
	}
	if strings.EqualFold(r.Method, "PUT") {
		_, err = tx.Exec(r.Context(), `INSERT INTO event_likes(user_id,event_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, actor, event)
	} else {
		_, err = tx.Exec(r.Context(), `DELETE FROM event_likes WHERE user_id=$1 AND event_id=$2`, actor, event)
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		router.RespondWithError(w, 503, "TEMPORARILY_UNAVAILABLE")
		return
	}
	h.HandleEventLikes(w, r)
}
