package app

import (
	"encoding/json"
	"net/http"
	db "pulse-api/db/generated"
	"strconv"

	// Înlocuiește cu path-ul exact definit în go.mod-ul tău

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// 1. OBTINERE EVENIMENT DUPĂ ID
func (app *Application) HandleGetEventByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")

	var eventUUID pgtype.UUID
	err := eventUUID.Scan(idStr)
	if err != nil || !eventUUID.Valid {
		respondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este un UUID invalid")
		return
	}

	// sqlc returnează tipul GetEventByIDRow pentru acest query
	event, err := app.Queries.GetEventByID(r.Context(), eventUUID)
	if err != nil {
		respondWithError(w, http.StatusNotFound, "Evenimentul nu a fost găsit")
		return
	}

	respondWithJSON(w, http.StatusOK, event)
}

// 2. CREARE EVENIMENT
func (app *Application) HandleCreateEvent(w http.ResponseWriter, r *http.Request) {
	var params db.CreateEventParams
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		respondWithError(w, http.StatusBadRequest, "Request body invalid: "+err.Error())
		return
	}

	// Apelăm funcția din baza de date care returnează tipul generat "Events"
	newEvent, err := app.Queries.CreateEvent(r.Context(), params)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Eroare la crearea evenimentului: "+err.Error())
		return
	}

	respondWithJSON(w, http.StatusCreated, newEvent)
}

// 3. LISTARE EVENIMENTE (CU PAGINARE ȘI FILTRARE DUPĂ CATEGORIE)
func (app *Application) HandleListEvents(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := int32(10) // implicit
	if val, err := strconv.Atoi(limitStr); err == nil {
		limit = int32(val)
	}

	offset := int32(0) // implicit
	if val, err := strconv.Atoi(offsetStr); err == nil {
		offset = int32(val)
	}

	// sqlc mapează prima variabilă ($1) ca Column1 în structura de parametri
	params := db.ListEventsParams{
		Column1: category,
		Limit:   limit,
		Offset:  offset,
	}

	events, err := app.Queries.ListEvents(r.Context(), params)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Eroare la listarea evenimentelor: "+err.Error())
		return
	}

	if events == nil {
		events = []db.ListEventsRow{}
	}

	respondWithJSON(w, http.StatusOK, events)
}

// 4. EVENIMENTE LIVE ÎN ZONĂ (GEOLOCAȚIE)
func (app *Application) HandleGetLiveEventsInArea(w http.ResponseWriter, r *http.Request) {
	latMinStr := r.URL.Query().Get("lat_min")
	latMaxStr := r.URL.Query().Get("lat_max")
	lngMinStr := r.URL.Query().Get("lng_min")
	lngMaxStr := r.URL.Query().Get("lng_max")

	latMin, errLatMin := strconv.ParseFloat(latMinStr, 64)
	latMax, errLatMax := strconv.ParseFloat(latMaxStr, 64)
	lngMin, errLngMin := strconv.ParseFloat(lngMinStr, 64)
	lngMax, errLngMax := strconv.ParseFloat(lngMaxStr, 64)

	if errLatMin != nil || errLatMax != nil || errLngMin != nil || errLngMax != nil {
		respondWithError(w, http.StatusBadRequest, "Parametrii geografici (lat_min, lat_max, lng_min, lng_max) lipsesc sau sunt invalizi")
		return
	}

	// Generat din query-ul: latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4
	params := db.GetLiveEventsInAreaParams{
		Latitude:    latMin,
		Latitude_2:  latMax,
		Longitude:   lngMin,
		Longitude_2: lngMax,
	}

	events, err := app.Queries.GetLiveEventsInArea(r.Context(), params)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Eroare la căutarea evenimentelor live: "+err.Error())
		return
	}

	if events == nil {
		events = []db.GetLiveEventsInAreaRow{}
	}

	respondWithJSON(w, http.StatusOK, events)
}

// 5. ȘTERGERE EVENIMENT
func (app *Application) HandleDeleteEvent(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")

	var eventUUID pgtype.UUID
	err := eventUUID.Scan(idStr)
	if err != nil || !eventUUID.Valid {
		respondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este un UUID invalid")
		return
	}

	err = app.Queries.DeleteEvent(r.Context(), eventUUID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Eroare la ștergerea evenimentului: "+err.Error())
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]string{"message": "Evenimentul a fost șters cu succes"})
}
