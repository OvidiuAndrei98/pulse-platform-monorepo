package events

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/organizer"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	Queries *db.Queries
	DB      *pgxpool.Pool
}

func NewHandler(queries *db.Queries, db *pgxpool.Pool) *Handler {
	return &Handler{
		Queries: queries,
		DB:      db,
	}
}

func publicationParams(status string, raw *string) (string, pgtype.Timestamptz, error) {
	if status != "draft" && status != "scheduled" && status != "published" {
		return "", pgtype.Timestamptz{}, fmt.Errorf("status invalid")
	}
	if status != "scheduled" {
		return status, pgtype.Timestamptz{}, nil
	}
	if raw == nil || *raw == "" {
		return "", pgtype.Timestamptz{}, fmt.Errorf("data publicarii este obligatorie")
	}
	publishAt, err := time.Parse(time.RFC3339, *raw)
	if err != nil || !publishAt.After(time.Now()) {
		return "", pgtype.Timestamptz{}, fmt.Errorf("data publicarii trebuie sa fie in viitor")
	}
	return status, pgtype.Timestamptz{Time: publishAt, Valid: true}, nil
}

// StartEventExpiryWorker publishes scheduled events and archives ended events.
// Multiple API tasks can run this safely because the update is idempotent.
func (h *Handler) StartEventExpiryWorker(ctx context.Context) {
	expireEvents := func() {
		runCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		publishedIDs, err := h.Queries.PublishDueEvents(runCtx)
		if err != nil {
			log.Printf("scheduled publishing worker: %v", err)
		} else {
			for _, eventID := range publishedIDs {
				if err := h.Queries.CreateOrganizerEventNotifications(runCtx, eventID); err != nil {
					log.Printf("scheduled event notification failed: %v", err)
				}
			}
		}
		if err := h.Queries.CompleteEndedEvents(runCtx); err != nil {
			log.Printf("event expiry worker: %v", err)
		}
	}

	go func() {
		expireEvents()
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				expireEvents()
			}
		}
	}()
}

// HandleCreateEvent - Creare atomică folosind structura curată de Request
func (h *Handler) HandleCreateEvent(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDStr, err := auth.GetUserIDFromContext(ctx)
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

	profile, err := h.Queries.GetOrganizerProfile(ctx, organizerUUID)
	if err != nil || !organizer.IsVerified(profile) {
		router.RespondWithError(w, http.StatusForbidden, "Firma organizatorului trebuie validata inainte de crearea unui eveniment")
		return
	}
	if len(req.TicketTypes) > 0 && !organizer.CanSellTickets(profile) {
		router.RespondWithError(w, http.StatusForbidden, "Configureaza Stripe inainte de a adauga bilete")
		return
	}

	if req.GooglePlaceId == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Date incomplete: locația este obligatorie")
		return
	}

	if req.City == "" {
		router.RespondWithError(w, http.StatusBadRequest, "City is required")
		return
	}
	if req.Vibe == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Vibe is required")
		return
	}
	status, publishAt, err := publicationParams(req.Status, req.PublishAt)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	if apiKey := os.Getenv("GOOGLE_MAPS_API_KEY"); apiKey != "" {
		if err := validateGooglePlaceID(ctx, req.GooglePlaceId, apiKey); err != nil {
			router.RespondWithError(w, http.StatusBadRequest, "Locația nu a putut fi verificată")
			return
		}
	}

	startTime, startErr := time.Parse(time.RFC3339, req.StartTime)
	endTime, endErr := time.Parse(time.RFC3339, req.EndTime)
	if startErr != nil || endErr != nil || !endTime.After(startTime) {
		router.RespondWithError(w, http.StatusBadRequest, "Intervalul evenimentului este invalid")
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Nu s-a putut iniția tranzacția")
		return
	}
	defer tx.Rollback(ctx)

	qtx := h.Queries.WithTx(tx)

	newEvent, err := qtx.CreateEvent(ctx, db.CreateEventParams{
		OrganizerID:                organizerUUID,
		Title:                      req.Title,
		Description:                pgtype.Text{String: req.Description, Valid: req.Description != ""},
		Category:                   req.Category,
		BannerUrl:                  pgtype.Text{String: req.BannerUrl, Valid: req.BannerUrl != ""},
		GooglePlaceID:              req.GooglePlaceId,
		LocationName:               req.LocationName,
		City:                       req.City,
		Vibe:                       req.Vibe,
		OrganizerAbsorbsServiceFee: req.OrganizerAbsorbsServiceFee,
		Latitude:                   req.Latitude,
		Longitude:                  req.Longitude,
		StartTime:                  pgtype.Timestamptz{Time: startTime, Valid: true},
		EndTime:                    pgtype.Timestamptz{Time: endTime, Valid: true},
		Status:                     status,
		PublishAt:                  publishAt,
		MarkPublished:              status == "published",
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la crearea evenimentului: "+err.Error())
		return
	}

	for _, t := range req.TicketTypes {
		tStart, _ := time.Parse(time.RFC3339, t.StartSales)
		tEnd, _ := time.Parse(time.RFC3339, t.EndSales)

		err = qtx.CreateTicketType(ctx, db.CreateTicketTypeParams{
			EventID:     newEvent.ID,
			Name:        t.Name,
			PriceRon:    t.PriceRon,
			Capacity:    t.Capacity,
			StartSales:  pgtype.Timestamptz{Time: tStart, Valid: true},
			EndSales:    pgtype.Timestamptz{Time: tEnd, Valid: true},
			Description: pgtype.Text{String: t.Description, Valid: t.Description != ""},
		})
		if err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Eroare la generarea biletelor")
			return
		}
	}

	if err := saveEventLineup(ctx, qtx, newEvent.ID, req.Lineup, false); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Lineup-ul nu a putut fi salvat: "+err.Error())
		return
	}

	if err := tx.Commit(ctx); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la salvarea tranzacției")
		return
	}
	if newEvent.Status == "published" {
		if err := h.Queries.CreateOrganizerEventNotifications(ctx, newEvent.ID); err != nil {
			log.Printf("organizer event notification failed for event %s: %v", common.UUIDToString(newEvent.ID), err)
		}
	}

	createdEvent, err := h.Queries.GetEventWithStats(ctx, newEvent.ID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Evenimentul a fost creat, dar nu a putut fi reincarcat")
		return
	}

	// Răspunsul respectă contractul EventResponse, inclusiv lineup-ul nou creat.
	router.RespondWithJSON(w, http.StatusCreated, MapFromDBGetEventWithStats(createdEvent))
}

// HandleEditEvent - Modificare eveniment
func (h *Handler) HandleEditEvent(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	var eventUUID pgtype.UUID
	if err := eventUUID.Scan(idStr); err != nil || !eventUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID invalid")
		return
	}

	var req EditEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Format JSON invalid: "+err.Error())
		return
	}

	if req.City == "" {
		router.RespondWithError(w, http.StatusBadRequest, "City is required")
		return
	}

	userID, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	existingEvent, err := h.Queries.GetEventWithStats(r.Context(), eventUUID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	}
	if common.UUIDToString(existingEvent.OrganizerID) != userID {
		router.RespondWithError(w, http.StatusForbidden, "Nu ai permisiunea sa modifici acest eveniment")
		return
	}
	if existingEvent.Status == "completed" || existingEvent.EndTime.Time.Before(time.Now()) {
		router.RespondWithError(w, http.StatusConflict, "Evenimentele incheiate nu mai pot fi modificate. Foloseste evenimentul ca template.")
		return
	}

	var organizerUUID pgtype.UUID
	if err := organizerUUID.Scan(userID); err != nil || !organizerUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID organizator invalid")
		return
	}
	profile, err := h.Queries.GetOrganizerProfile(r.Context(), organizerUUID)
	if err != nil || !organizer.IsVerified(profile) {
		router.RespondWithError(w, http.StatusForbidden, "Firma organizatorului trebuie validata inainte de modificarea unui eveniment")
		return
	}
	for _, ticketType := range req.TicketTypes {
		if ticketType.ID == nil || *ticketType.ID == "" {
			if !organizer.CanSellTickets(profile) {
				router.RespondWithError(w, http.StatusForbidden, "Configureaza Stripe inainte de a adauga bilete")
				return
			}
			break
		}
	}
	previousBannerURL := existingEvent.BannerUrl.String
	if req.Vibe == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Vibe is required")
		return
	}
	googlePlaceID := req.GooglePlaceID
	if googlePlaceID == "" {
		locationChanged := req.LocationName != existingEvent.LocationName ||
			req.Latitude != existingEvent.Latitude ||
			req.Longitude != existingEvent.Longitude
		if locationChanged {
			router.RespondWithError(w, http.StatusBadRequest, "Selecteaza o locatie din sugestiile Google dupa ce modifici locatia")
			return
		}
		googlePlaceID = existingEvent.GooglePlaceID
	}

	startTime, err := time.Parse(time.RFC3339, req.StartTime)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Data startTime invalida")
		return
	}

	endTime, err := time.Parse(time.RFC3339, req.EndTime)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Data endTime invalida")
		return
	}
	status, publishAt, err := publicationParams(req.Status, req.PublishAt)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la pornirea tranzactiei")
		return
	}
	defer tx.Rollback(r.Context())

	qtx := h.Queries.WithTx(tx)
	bannerURL := pgtype.Text{}
	if req.BannerURL != nil && *req.BannerURL != "" {
		bannerURL = pgtype.Text{String: *req.BannerURL, Valid: true}
	}

	// 4. Update Eveniment
	event, err := qtx.EditEvent(r.Context(), db.EditEventParams{
		ID:                         eventUUID,
		Title:                      req.Title,
		Category:                   req.Category,
		StartTime:                  pgtype.Timestamptz{Time: startTime, Valid: true},
		EndTime:                    pgtype.Timestamptz{Time: endTime, Valid: true},
		LocationName:               req.LocationName,
		Latitude:                   req.Latitude,
		Longitude:                  req.Longitude,
		GooglePlaceID:              googlePlaceID,
		Description:                pgtype.Text{String: req.Description, Valid: true},
		Status:                     status,
		PublishAt:                  publishAt,
		MarkPublished:              status == "published",
		BannerUrl:                  bannerURL,
		City:                       req.City,
		Vibe:                       req.Vibe,
		OrganizerAbsorbsServiceFee: req.OrganizerAbsorbsServiceFee,
		// Adaugă restul câmpurilor din EditEventParams generat de sqlc
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la salvarea evenimentului: "+err.Error())
		return
	}

	// 5. Procesare Bilete (Upsert: Update dacă are ID, Insert dacă nu are ID)
	for _, t := range req.TicketTypes {
		startSales, _ := time.Parse(time.RFC3339, t.StartSales)
		endSales, _ := time.Parse(time.RFC3339, t.EndSales)

		var ticketUUID pgtype.UUID
		if t.ID != nil && *t.ID != "" {
			_ = ticketUUID.Scan(*t.ID)
		}

		if ticketUUID.Valid {
			err = qtx.UpdateTicketType(r.Context(), db.UpdateTicketTypeParams{
				ID:          ticketUUID,
				Name:        t.Name,
				PriceRon:    t.PriceRon,
				Capacity:    t.Capacity,
				Description: pgtype.Text{String: t.Description, Valid: true},
				StartSales:  pgtype.Timestamptz{Time: startSales, Valid: true},
				EndSales:    pgtype.Timestamptz{Time: endSales, Valid: true},
			})
		} else {
			err = qtx.CreateTicketType(r.Context(), db.CreateTicketTypeParams{
				EventID:     eventUUID,
				Name:        t.Name,
				PriceRon:    t.PriceRon,
				Capacity:    t.Capacity,
				Description: pgtype.Text{String: t.Description, Valid: true},
				StartSales:  pgtype.Timestamptz{Time: startSales, Valid: true},
				EndSales:    pgtype.Timestamptz{Time: endSales, Valid: true},
			})
		}

		if err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Eroare la salvarea biletului: "+err.Error())
			return
		}
	}

	if req.Lineup != nil {
		if err := saveEventLineup(r.Context(), qtx, eventUUID, *req.Lineup, true); err != nil {
			router.RespondWithError(w, http.StatusBadRequest, "Lineup-ul nu a putut fi salvat: "+err.Error())
			return
		}
	}

	// 6. Commit Tranzacție
	if err := tx.Commit(r.Context()); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la finalizarea tranzactiei")
		return
	}
	if existingEvent.Status != "published" && event.Status == "published" {
		if err := h.Queries.CreateOrganizerEventNotifications(r.Context(), event.ID); err != nil {
			log.Printf("organizer event notification failed for event %s: %v", idStr, err)
		}
	}

	if previousBannerURL != event.BannerUrl.String {
		if err := deleteManagedEventBanner(r.Context(), previousBannerURL); err != nil {
			log.Printf("event banner cleanup failed after update for event %s: %v", idStr, err)
		}
	}

	router.RespondWithJSON(w, http.StatusOK, event)
}

// HandleDeleteEvent - Ștergere eveniment
func (h *Handler) HandleDeleteEvent(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	var eventUUID pgtype.UUID
	if err := eventUUID.Scan(idStr); err != nil || !eventUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID invalid")
		return
	}

	userID, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	existingEvent, err := h.Queries.GetEventWithStats(r.Context(), eventUUID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	}
	if common.UUIDToString(existingEvent.OrganizerID) != userID {
		router.RespondWithError(w, http.StatusForbidden, "Nu ai permisiunea sa stergi acest eveniment")
		return
	}

	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la pornirea tranzactiei")
		return
	}
	defer tx.Rollback(r.Context())

	qtx := h.Queries.WithTx(tx)
	completedOrders, err := qtx.CountCompletedOrdersForEvent(r.Context(), eventUUID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Vanzarile evenimentului nu au putut fi verificate")
		return
	}
	if completedOrders > 0 {
		router.RespondWithError(w, http.StatusConflict, "Evenimentele cu bilete vandute nu pot fi sterse")
		return
	}

	orders, err := qtx.CountEventOrders(r.Context(), eventUUID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Comenzile evenimentului nu au putut fi verificate")
		return
	}
	if orders > 0 {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul are comenzi de bilete si nu poate fi sters")
		return
	}

	if existingEvent.Status == "published" {
		if err := qtx.SetEventStatus(r.Context(), db.SetEventStatusParams{ID: eventUUID, Status: "draft"}); err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Evenimentul nu a putut fi mutat in draft inainte de stergere")
			return
		}
	}

	if err := qtx.DeleteEvent(r.Context(), eventUUID); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la ștergerea evenimentului")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la finalizarea stergerii evenimentului")
		return
	}
	if err := deleteManagedEventBanner(r.Context(), existingEvent.BannerUrl.String); err != nil {
		log.Printf("event banner cleanup failed after delete for event %s: %v", idStr, err)
	}
	w.WriteHeader(http.StatusNoContent)
}

// HandleGetLiveEventsInArea - Căutare pe hartă
func (h *Handler) HandleGetLiveEventsInArea(w http.ResponseWriter, r *http.Request) {
	latMin, _ := strconv.ParseFloat(r.URL.Query().Get("latMin"), 64)
	latMax, _ := strconv.ParseFloat(r.URL.Query().Get("latMax"), 64)
	lonMin, _ := strconv.ParseFloat(r.URL.Query().Get("lonMin"), 64)
	lonMax, _ := strconv.ParseFloat(r.URL.Query().Get("lonMax"), 64)

	events, err := h.Queries.GetLiveEventsInArea(r.Context(), db.GetLiveEventsInAreaParams{
		Latitude:    latMin,
		Latitude_2:  latMax,
		Longitude:   lonMin,
		Longitude_2: lonMax,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la preluarea hărții")
		return
	}

	result := make([]db.GetLiveEventsInAreaRow, 0, len(events))
	for _, e := range events {
		result = append(result, e)
	}
	router.RespondWithJSON(w, http.StatusOK, result)
}

func validateGooglePlaceID(ctx context.Context, placeID, apiKey string) error {
	url := fmt.Sprintf("https://maps.googleapis.com/maps/api/place/details/json?place_id=%s&fields=place_id&key=%s", placeID, apiKey)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var result struct {
		Status string `json:"status"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&result)
	if result.Status != "OK" {
		return fmt.Errorf("place ID invalid")
	}
	return nil
}

// HandleListEvents preia evenimentele publice (suportă filtrare categorie, live sau geolocație pentru hartă)
func (h *Handler) HandleListEvents(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	city := r.URL.Query().Get("city")
	vibe := r.URL.Query().Get("vibe")
	startsAfter, startsAfterErr := parseOptionalEventTime(r.URL.Query().Get("startsAfter"))
	startsBefore, startsBeforeErr := parseOptionalEventTime(r.URL.Query().Get("startsBefore"))
	if startsAfterErr != nil || startsBeforeErr != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Intervalul de timp este invalid")
		return
	}
	pageStr := r.URL.Query().Get("page")
	organizerID := pgtype.UUID{}
	if organizerIDValue := r.URL.Query().Get("organizerId"); organizerIDValue != "" {
		if err := organizerID.Scan(organizerIDValue); err != nil || !organizerID.Valid {
			router.RespondWithError(w, http.StatusBadRequest, "ID organizator invalid")
			return
		}
	}

	// Preluare parametri hartă (dacă există)
	latMinStr := r.URL.Query().Get("latMin")
	latMaxStr := r.URL.Query().Get("latMax")
	lonMinStr := r.URL.Query().Get("lonMin")
	lonMaxStr := r.URL.Query().Get("lonMax")

	// Paginare implicită
	page := int32(0)
	if val, err := strconv.Atoi(pageStr); err == nil && val > 1 {
		page = int32(val) - 1
	}
	pageSize := int32(20)
	if organizerID.Valid {
		pageSize = 100
	}

	params := db.ListEventsParams{
		Category:     category,
		City:         city,
		Vibe:         vibe,
		StartsAfter:  startsAfter,
		StartsBefore: startsBefore,
		ReqLimit:     pageSize,
		ReqOffset:    page * pageSize,
		OrganizerID:  organizerID,
	}

	// Setăm valoarea pentru starea Check-In a utilizatorului curent
	var pgUserID pgtype.UUID
	if userIDStr, err := auth.GetUserIDFromContext(r.Context()); err == nil && userIDStr != "" {
		_ = pgUserID.Scan(userIDStr)
	}
	params.UserID = pgUserID

	// Filtru opțional Geolocație (Hartă)
	if latMin, err := strconv.ParseFloat(latMinStr, 64); err == nil {
		latMax, _ := strconv.ParseFloat(latMaxStr, 64)
		lonMin, _ := strconv.ParseFloat(lonMinStr, 64)
		lonMax, _ := strconv.ParseFloat(lonMaxStr, 64)

		params.LatMin = pgtype.Float8{Float64: latMin, Valid: true}
		params.LatMax = pgtype.Float8{Float64: latMax, Valid: true}
		params.LonMin = pgtype.Float8{Float64: lonMin, Valid: true}
		params.LonMax = pgtype.Float8{Float64: lonMax, Valid: true}
	}

	dbEvents, err := h.Queries.ListEvents(r.Context(), params)
	if err != nil {
		log.Printf("ListEvents query failed: %v", err)
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la listare")
		return
	}

	result := make([]EventResponse, 0, len(dbEvents))
	for _, row := range dbEvents {
		row.IsLive = pgtype.Bool{Bool: time.Now().After(row.StartTime.Time) && time.Now().Before(row.EndTime.Time), Valid: true}
		result = append(result, MapFromDBListEvents(row))

	}
	router.RespondWithJSON(w, http.StatusOK, result)
}

func parseOptionalEventTime(value string) (pgtype.Timestamptz, error) {
	if value == "" {
		return pgtype.Timestamptz{}, nil
	}

	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return pgtype.Timestamptz{}, err
	}
	return pgtype.Timestamptz{Time: parsed, Valid: true}, nil
}

func (h *Handler) HandleGetEventByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	var eventUUID pgtype.UUID
	if err := eventUUID.Scan(idStr); err != nil || !eventUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}

	// Preluăm ID-ul utilizatorului din context dacă este autentificat (pentru user_has_checked_in)
	var pgUserID pgtype.UUID
	if userIDStr, err := auth.GetUserIDFromContext(r.Context()); err == nil && userIDStr != "" {
		_ = pgUserID.Scan(userIDStr)
	}

	// Executăm query-ul unificat
	dbRow, err := h.Queries.GetEventByID(r.Context(), db.GetEventByIDParams{
		UserID: pgUserID,
		ID:     eventUUID,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost găsit")
		return
	}

	dbRow.IsLive = pgtype.Bool{Bool: time.Now().After(dbRow.StartTime.Time) && time.Now().Before(dbRow.EndTime.Time), Valid: true}

	// Returnăm structura curată, cu bilete incluse și fără date financiare secrete
	router.RespondWithJSON(w, http.StatusOK, MapFromDBGetEvent(dbRow))
}

// HandleListEventsWithStats se ocupă strict de Dashboard-ul organizatorului
func (h *Handler) HandleListEventsWithStats(w http.ResponseWriter, r *http.Request) {
	userIDStr, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	var organizerUUID pgtype.UUID
	_ = organizerUUID.Scan(userIDStr)

	dbRows, err := h.Queries.ListEventsWithStats(r.Context(), organizerUUID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la procesarea datelor de dashboard")
		return
	}

	result := make([]EventResponse, 0, len(dbRows))
	for _, row := range dbRows {
		row.IsLive = pgtype.Bool{Bool: time.Now().After(row.StartTime.Time) && time.Now().Before(row.EndTime.Time), Valid: true}
		result = append(result, MapFromDBListEventsWithStats(row))
	}
	router.RespondWithJSON(w, http.StatusOK, result)
}

func (h *Handler) HandleGetEventWithStats(w http.ResponseWriter, r *http.Request) {
	// 1. Preluăm și validăm ID-ul utilizatorului logat (trebuie să fie organizatorul)
	userIDStr, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	// 2. Preluăm ID-ul evenimentului din URL
	idStr := chi.URLParam(r, "id")
	var eventUUID pgtype.UUID
	if err := eventUUID.Scan(idStr); err != nil || !eventUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}

	// 3. Executăm query-ul complet cu statistici
	dbRow, err := h.Queries.GetEventWithStats(r.Context(), eventUUID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost găsit")
		return
	}

	// 4. Protecție: Verificăm dacă cel care cere statisticile este chiar organizatorul acestui eveniment
	if common.UUIDToString(dbRow.OrganizerID) != userIDStr {
		router.RespondWithError(w, http.StatusForbidden, "Nu aveți permisiunea de a vedea statisticile acestui eveniment")
		return
	}

	dbRow.IsLive = pgtype.Bool{Bool: time.Now().After(dbRow.StartTime.Time) && time.Now().Before(dbRow.EndTime.Time), Valid: true}

	// 5. Trimitem răspunsul complet (cu vânzări și încasări incluse)
	router.RespondWithJSON(w, http.StatusOK, MapFromDBGetEventWithStats(dbRow))
}
