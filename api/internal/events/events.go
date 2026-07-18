package events

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/dto"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type CreateEventRequest struct {
	Title         string  `json:"title"`
	Description   string  `json:"description"`
	Category      string  `json:"category"`
	BannerUrl     string  `json:"bannerUrl"`
	GooglePlaceId string  `json:"googlePlaceId"`
	LocationName  string  `json:"locationName"`
	Latitude      float64 `json:"latitude"`
	Longitude     float64 `json:"longitude"`
	StartTime     string  `json:"startTime"`
	EndTime       string  `json:"endTime"`
}

// Handler colectează dependențele specifice domeniului de evenimente
type Handler struct {
	Queries *db.Queries
}

// NewHandler instanțiază un nou handler pentru evenimente
func NewHandler(queries *db.Queries) *Handler {
	return &Handler{
		Queries: queries,
	}
}

func validateGooglePlaceID(ctx context.Context, placeID, apiKey string) error {
	url := fmt.Sprintf(
		"https://maps.googleapis.com/maps/api/place/details/json?place_id=%s&fields=place_id&key=%s",
		placeID, apiKey,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var result struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}
	if result.Status != "OK" {
		return fmt.Errorf("place ID invalid: %s", result.Status)
	}
	return nil
}

func (h *Handler) HandleGetEventByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")

	var eventUUID pgtype.UUID
	err := eventUUID.Scan(idStr)
	if err != nil || !eventUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este un UUID invalid")
		return
	}

	event, err := h.Queries.GetEventByID(r.Context(), eventUUID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost găsit")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, dto.MapGetEventByIDRow(event))
}

func (h *Handler) HandleCreateEvent(w http.ResponseWriter, r *http.Request) {
	userIDStr, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var organizerUUID pgtype.UUID
	if err := organizerUUID.Scan(userIDStr); err != nil || !organizerUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID utilizator invalid în token")
		return
	}

	var req CreateEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	if req.GooglePlaceId == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Locația trebuie selectată prin Google Places (googlePlaceId obligatoriu)")
		return
	}
	if apiKey := os.Getenv("GOOGLE_MAPS_API_KEY"); apiKey != "" {
		if err := validateGooglePlaceID(r.Context(), req.GooglePlaceId, apiKey); err != nil {
			router.RespondWithError(w, http.StatusBadRequest, "Locația nu a putut fi verificată prin Google Places")
			return
		}
	}

	startTime, err := time.Parse(time.RFC3339, req.StartTime)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "startTime invalid (trebuie să fie ISO 8601 / RFC3339)")
		return
	}

	endTime, err := time.Parse(time.RFC3339, req.EndTime)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "endTime invalid (trebuie să fie ISO 8601 / RFC3339)")
		return
	}

	params := db.CreateEventParams{
		OrganizerID:  organizerUUID,
		Title:        req.Title,
		Description:  pgtype.Text{String: req.Description, Valid: req.Description != ""},
		Category:     req.Category,
		BannerUrl:    pgtype.Text{String: req.BannerUrl, Valid: req.BannerUrl != ""},
		LocationName: req.LocationName,
		Latitude:     req.Latitude,
		Longitude:    req.Longitude,
		StartTime:    pgtype.Timestamptz{Time: startTime, Valid: true},
		EndTime:      pgtype.Timestamptz{Time: endTime, Valid: true},
	}

	newEvent, err := h.Queries.CreateEvent(r.Context(), params)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la crearea evenimentului: "+err.Error())
		return
	}

	router.RespondWithJSON(w, http.StatusCreated, dto.MapEvents(newEvent))
}

func (h *Handler) HandleListEvents(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	pageStr := r.URL.Query().Get("page")

	page := int32(0)
	if val, err := strconv.Atoi(pageStr); err == nil && val > 1 {
		page = int32(val) - 1
	}

	const pageSize = int32(20)

	params := db.ListEventsParams{
		Column1: category,
		Limit:   pageSize,
		Offset:  page * pageSize,
	}

	events, err := h.Queries.ListEvents(r.Context(), params)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la listarea evenimentelor: "+err.Error())
		return
	}

	result := make([]dto.EventResponse, 0, len(events))
	for _, e := range events {
		result = append(result, dto.MapListEventsRow(e))
	}

	router.RespondWithJSON(w, http.StatusOK, result)
}

func (h *Handler) HandleGetLiveEventsInArea(w http.ResponseWriter, r *http.Request) {
	latMinStr := r.URL.Query().Get("latMin")
	latMaxStr := r.URL.Query().Get("latMax")
	lonMinStr := r.URL.Query().Get("lonMin")
	lonMaxStr := r.URL.Query().Get("lonMax")

	latMin, errLatMin := strconv.ParseFloat(latMinStr, 64)
	latMax, errLatMax := strconv.ParseFloat(latMaxStr, 64)
	lonMin, errLonMin := strconv.ParseFloat(lonMinStr, 64)
	lonMax, errLonMax := strconv.ParseFloat(lonMaxStr, 64)

	if errLatMin != nil || errLatMax != nil || errLonMin != nil || errLonMax != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Parametrii geografici (latMin, latMax, lonMin, lonMax) lipsesc sau sunt invalizi")
		return
	}

	params := db.GetLiveEventsInAreaParams{
		Latitude:    latMin,
		Latitude_2:  latMax,
		Longitude:   lonMin,
		Longitude_2: lonMax,
	}

	events, err := h.Queries.GetLiveEventsInArea(r.Context(), params)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la căutarea evenimentelor live: "+err.Error())
		return
	}

	result := make([]dto.EventResponse, 0, len(events))
	for _, e := range events {
		result = append(result, dto.MapGetLiveEventsInAreaRow(e))
	}

	router.RespondWithJSON(w, http.StatusOK, result)
}

func (h *Handler) HandleDeleteEvent(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")

	var eventUUID pgtype.UUID
	err := eventUUID.Scan(idStr)
	if err != nil || !eventUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este un UUID invalid")
		return
	}

	err = h.Queries.DeleteEvent(r.Context(), eventUUID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la ștergerea evenimentului: "+err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) HandleGetEventWithStats(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")

	var eventID pgtype.UUID
	err := eventID.Scan(idStr)
	if err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este un UUID invalid")
		return
	}

	var pgUserID pgtype.UUID
	userIDStr, err := auth.GetUserIDFromContext(r.Context())

	if err != nil || userIDStr == "" {

		pgUserID.Valid = false
	} else {
		if err := pgUserID.Scan(userIDStr); err != nil {
			pgUserID.Valid = false
		}
	}

	event, err := h.Queries.GetEventWithStats(r.Context(), db.GetEventWithStatsParams{
		UserID: pgUserID,
		ID:     eventID,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la obținerea evenimentului: "+err.Error())
		return
	}

	result := dto.MapGetEventWithStatsRow(event)
	router.RespondWithJSON(w, http.StatusOK, result)
}

func (h *Handler) HandleEditEvent(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	var eventUUID pgtype.UUID
	err := eventUUID.Scan(idStr)
	if err != nil || !eventUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este un UUID invalid")
		return
	}

	var editEventParams db.EditEventParams
	// Populate editEventParams with data from the request body
	err = json.NewDecoder(r.Body).Decode(&editEventParams)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Date invalide pentru editarea evenimentului: "+err.Error())
		return
	}
	editEventParams.ID = eventUUID

	event, err := h.Queries.EditEvent(r.Context(), editEventParams)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la editarea evenimentului: "+err.Error())
		return
	}

	result := dto.MapEvents(event)
	router.RespondWithJSON(w, http.StatusOK, result)
}
