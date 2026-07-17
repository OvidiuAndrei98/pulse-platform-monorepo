package events

import (
	"encoding/json"
	"net/http"
	"strconv"

	db "pulse-api/db/generated"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

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

	router.RespondWithJSON(w, http.StatusOK, event)
}

func (h *Handler) HandleCreateEvent(w http.ResponseWriter, r *http.Request) {
	var params db.CreateEventParams
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	newEvent, err := h.Queries.CreateEvent(r.Context(), params)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la crearea evenimentului: "+err.Error())
		return
	}

	router.RespondWithJSON(w, http.StatusCreated, newEvent)
}

func (h *Handler) HandleListEvents(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := int32(10)
	if val, err := strconv.Atoi(limitStr); err == nil {
		limit = int32(val)
	}

	offset := int32(0)
	if val, err := strconv.Atoi(offsetStr); err == nil {
		offset = int32(val)
	}

	params := db.ListEventsParams{
		Column1: category,
		Limit:   limit,
		Offset:  offset,
	}

	events, err := h.Queries.ListEvents(r.Context(), params)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la listarea evenimentelor: "+err.Error())
		return
	}

	if events == nil {
		events = []db.ListEventsRow{}
	}

	router.RespondWithJSON(w, http.StatusOK, events)
}

func (h *Handler) HandleGetLiveEventsInArea(w http.ResponseWriter, r *http.Request) {
	latMinStr := r.URL.Query().Get("lat_min")
	latMaxStr := r.URL.Query().Get("lat_max")
	lngMinStr := r.URL.Query().Get("lng_min")
	lngMaxStr := r.URL.Query().Get("lng_max")

	latMin, errLatMin := strconv.ParseFloat(latMinStr, 64)
	latMax, errLatMax := strconv.ParseFloat(latMaxStr, 64)
	lngMin, errLngMin := strconv.ParseFloat(lngMinStr, 64)
	lngMax, errLngMax := strconv.ParseFloat(lngMaxStr, 64)

	if errLatMin != nil || errLatMax != nil || errLngMin != nil || errLngMax != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Parametrii geografici (lat_min, lat_max, lng_min, lng_max) lipsesc sau sunt invalizi")
		return
	}

	params := db.GetLiveEventsInAreaParams{
		Latitude:    latMin,
		Latitude_2:  latMax,
		Longitude:   lngMin,
		Longitude_2: lngMax,
	}

	events, err := h.Queries.GetLiveEventsInArea(r.Context(), params)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la căutarea evenimentelor live: "+err.Error())
		return
	}

	if events == nil {
		events = []db.GetLiveEventsInAreaRow{}
	}

	router.RespondWithJSON(w, http.StatusOK, events)
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

	router.RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Evenimentul a fost șters cu succes"})
}
