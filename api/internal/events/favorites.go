package events

import (
	"net/http"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func (h *Handler) HandleSaveEvent(w http.ResponseWriter, r *http.Request) {
	userID, eventID, ok := favoriteIDs(w, r)
	if !ok {
		return
	}
	if _, err := h.Queries.GetEventWithStats(r.Context(), eventID); err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	}
	if err := h.Queries.SaveEvent(r.Context(), db.SaveEventParams{UserID: userID, EventID: eventID}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Evenimentul nu a putut fi salvat")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) HandleRemoveSavedEvent(w http.ResponseWriter, r *http.Request) {
	userID, eventID, ok := favoriteIDs(w, r)
	if !ok {
		return
	}
	if err := h.Queries.RemoveSavedEvent(r.Context(), db.RemoveSavedEventParams{UserID: userID, EventID: eventID}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Evenimentul nu a putut fi eliminat")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) HandleListSavedEvents(w http.ResponseWriter, r *http.Request) {
	userIDString, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	var userID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID utilizator invalid")
		return
	}

	events, err := h.Queries.ListSavedEvents(r.Context(), userID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Evenimentele salvate nu au putut fi incarcate")
		return
	}

	result := make([]EventResponse, 0, len(events))
	for _, event := range events {
		event.IsLive = pgtype.Bool{Bool: time.Now().After(event.StartTime.Time) && time.Now().Before(event.EndTime.Time), Valid: true}
		result = append(result, MapFromDBSavedEvent(event))
	}
	router.RespondWithJSON(w, http.StatusOK, result)
}

func favoriteIDs(w http.ResponseWriter, r *http.Request) (pgtype.UUID, pgtype.UUID, bool) {
	userIDString, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return pgtype.UUID{}, pgtype.UUID{}, false
	}

	var userID, eventID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID utilizator invalid")
		return pgtype.UUID{}, pgtype.UUID{}, false
	}
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID eveniment invalid")
		return pgtype.UUID{}, pgtype.UUID{}, false
	}
	return userID, eventID, true
}

func MapFromDBSavedEvent(event db.Events) EventResponse {
	isFavorited := true

	return EventResponse{
		ID:           common.UUIDToString(event.ID),
		OrganizerID:  common.UUIDToString(event.OrganizerID),
		Title:        event.Title,
		Description:  event.Description.String,
		Category:     event.Category,
		Status:       event.Status,
		BannerUrl:    event.BannerUrl.String,
		LocationName: event.LocationName,
		City:         event.City,
		Vibe:         event.Vibe,
		Latitude:     event.Latitude,
		Longitude:    event.Longitude,
		StartTime:    event.StartTime.Time,
		EndTime:      event.EndTime.Time,
		IsLive:       common.PgBoolToBool(event.IsLive),
		CreatedAt:    event.CreatedAt.Time,
		TicketTypes:  []TicketTypeResponse{},
		Stats: EventStatsResponse{
			IsFavorited: &isFavorited,
		},
	}
}
