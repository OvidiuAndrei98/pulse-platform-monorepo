package notifications

import (
	"net/http"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const notificationPageSize int32 = 30

type Handler struct {
	Queries *db.Queries
}

func NewHandler(queries *db.Queries) *Handler {
	return &Handler{Queries: queries}
}

type NotificationResponse struct {
	ID             string `json:"id"`
	Type           string `json:"type"`
	Title          string `json:"title"`
	Body           string `json:"body"`
	EventID        string `json:"eventId,omitempty"`
	ActorID        string `json:"actorId,omitempty"`
	ActorUsername  string `json:"actorUsername,omitempty"`
	ActorAvatarURL string `json:"actorAvatarUrl,omitempty"`
	IsRead         bool   `json:"isRead"`
	CreatedAt      string `json:"createdAt"`
}

type ListResponse struct {
	Items       []NotificationResponse `json:"items"`
	UnreadCount int64                  `json:"unreadCount"`
}

func userIDFromRequest(r *http.Request) (pgtype.UUID, bool) {
	value, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		return pgtype.UUID{}, false
	}

	var userID pgtype.UUID
	if err := userID.Scan(value); err != nil || !userID.Valid {
		return pgtype.UUID{}, false
	}
	return userID, true
}

func (h *Handler) HandleList(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(r)
	if !ok {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	rows, err := h.Queries.ListNotifications(r.Context(), db.ListNotificationsParams{
		UserID: userID,
		Limit:  notificationPageSize,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Notificarile nu au putut fi incarcate")
		return
	}
	unreadCount, err := h.Queries.CountUnreadNotifications(r.Context(), userID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Notificarile nu au putut fi incarcate")
		return
	}

	items := make([]NotificationResponse, 0, len(rows))
	for _, row := range rows {
		items = append(items, NotificationResponse{
			ID:             common.UUIDToString(row.ID),
			Type:           row.Type,
			Title:          row.Title,
			Body:           row.Body,
			EventID:        common.UUIDToString(row.EventID),
			ActorID:        common.UUIDToString(row.ActorID),
			ActorUsername:  row.ActorUsername,
			ActorAvatarURL: row.ActorAvatarUrl.String,
			IsRead:         row.ReadAt.Valid,
			CreatedAt:      common.TimestampToString(row.CreatedAt),
		})
	}

	router.RespondWithJSON(w, http.StatusOK, ListResponse{Items: items, UnreadCount: unreadCount})
}

func (h *Handler) HandleMarkAllRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(r)
	if !ok {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	if err := h.Queries.MarkAllNotificationsRead(r.Context(), userID); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Notificarile nu au putut fi actualizate")
		return
	}
	router.RespondWithJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) HandleMarkRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(r)
	if !ok {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var notificationID pgtype.UUID
	if err := notificationID.Scan(chi.URLParam(r, "id")); err != nil || !notificationID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID notificare invalid")
		return
	}

	if err := h.Queries.MarkNotificationRead(r.Context(), db.MarkNotificationReadParams{
		ID:     notificationID,
		UserID: userID,
	}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Notificarea nu a putut fi actualizata")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, map[string]bool{"success": true})
}
