package events

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/cache"
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
	lists   *cache.TTL[[]db.ListEventsRow]
	details *cache.TTL[db.GetEventByIDRow]
}

func NewHandler(queries *db.Queries, pool *pgxpool.Pool) *Handler {
	return &Handler{
		Queries: queries,
		DB:      pool,
		lists:   cache.New[[]db.ListEventsRow](256, 2*time.Second),
		details: cache.New[db.GetEventByIDRow](256, 2*time.Second),
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
		if _, err := h.Queries.RemoveStaleEventBannerReferences(runCtx); err != nil {
			log.Printf("event banner stale reference cleanup: %v", err)
		} else if err := h.Queries.ReconcileLegacyEventBannerReferences(runCtx); err != nil {
			log.Printf("event banner registry reconciliation: %v", err)
		} else if _, err := h.Queries.ScheduleAllUnreferencedEventBannerAssets(runCtx); err != nil {
			log.Printf("event banner orphan scheduling: %v", err)
		}
		cancel()

		// Keep cleanup disabled through mixed-version deployments. Old API tasks
		// do not register banner references, so enable this only after they drain.
		if strings.EqualFold(strings.TrimSpace(os.Getenv("EVENT_BANNER_GC_ENABLED")), "true") {
			gcCtx, gcCancel := context.WithTimeout(ctx, 30*time.Second)
			defer gcCancel()
			if err := h.cleanupDueEventBanners(gcCtx, deleteStoredEventBanner); err != nil {
				log.Printf("event banner cleanup worker: %v", err)
			}
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
	externalURL, err := externalTicketURL(req.ExternalTicketURL)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	var vat pgtype.Numeric
	if externalURL.Valid {
		if len(req.TicketTypes) > 0 {
			router.RespondWithError(w, http.StatusBadRequest, "Alege fie bilete Spottr, fie un link extern pentru bilete")
			return
		}
		req.OrganizerAbsorbsServiceFee = false
	} else {
		vat, err = eventVAT(req.VATPercentage)
		if err != nil {
			router.RespondWithError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	profile, err := h.Queries.GetOrganizerProfile(ctx, organizerUUID)
	if err != nil || !organizer.IsVerified(profile) {
		router.RespondWithError(w, http.StatusForbidden, "Firma organizatorului trebuie validata inainte de crearea unui eveniment")
		return
	}
	hasPaidTickets := false
	for _, ticketType := range req.TicketTypes {
		if ticketType.PriceRon < 0 {
			router.RespondWithError(w, http.StatusBadRequest, "Pretul biletului nu poate fi negativ")
			return
		}
		hasPaidTickets = hasPaidTickets || ticketType.PriceRon > 0
	}
	if hasPaidTickets && !organizer.CanSellTickets(profile) {
		router.RespondWithError(w, http.StatusForbidden, "Configureaza Stripe inainte de a adauga bilete")
		return
	}
	if req.BannerUrl != "" {
		if _, ok := ownedEventBannerKey(req.BannerUrl, userIDStr); !ok {
			router.RespondWithError(w, http.StatusBadRequest, "Bannerul trebuie incarcat din contul organizatorului curent")
			return
		}
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
	claimedBannerAsset, err := claimEventBannerAsset(ctx, qtx, organizerUUID, pgtype.UUID{}, req.BannerUrl)
	if errors.Is(err, errEventBannerAssetUnavailable) {
		router.RespondWithError(w, http.StatusBadRequest, "Bannerul nu mai este disponibil. Incarca-l din nou")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Bannerul nu a putut fi rezervat")
		return
	}

	newEvent, err := qtx.CreateEvent(ctx, db.CreateEventParams{
		VatPercentage:              vat,
		ExternalTicketUrl:          externalURL,
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
	if err := applyEventBannerReference(ctx, qtx, newEvent.ID, pgtype.UUID{}, claimedBannerAsset); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Bannerul evenimentului nu a putut fi salvat")
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

	if err := saveEventLineup(ctx, qtx, newEvent.ID, organizerUUID, req.Lineup, false); err != nil {
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
	externalURL, err := externalTicketURL(req.ExternalTicketURL)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	var vat pgtype.Numeric
	if externalURL.Valid {
		if len(req.TicketTypes) > 0 {
			router.RespondWithError(w, http.StatusBadRequest, "Alege fie bilete Spottr, fie un link extern pentru bilete")
			return
		}
		req.OrganizerAbsorbsServiceFee = false
	} else {
		vat, err = eventVAT(req.VATPercentage)
		if err != nil {
			router.RespondWithError(w, http.StatusBadRequest, err.Error())
			return
		}
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
	if existingEvent.Status == "cancel_pending" || existingEvent.Status == "refunding" || existingEvent.Status == "cancelled" {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul nu poate fi modificat cat timp anularea sau refundurile sunt procesate")
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
	hasPaidTickets := false
	for _, ticketType := range req.TicketTypes {
		if ticketType.PriceRon < 0 {
			router.RespondWithError(w, http.StatusBadRequest, "Pretul biletului nu poate fi negativ")
			return
		}
		hasPaidTickets = hasPaidTickets || ticketType.PriceRon > 0
	}
	if hasPaidTickets && !organizer.CanSellTickets(profile) {
		router.RespondWithError(w, http.StatusForbidden, "Configureaza Stripe inainte de a salva bilete cu plata")
		return
	}
	if req.BannerURL != nil && *req.BannerURL != "" {
		if _, ok := ownedEventBannerKey(*req.BannerURL, userID); !ok {
			router.RespondWithError(w, http.StatusBadRequest, "Bannerul trebuie incarcat din contul organizatorului curent")
			return
		}
	}
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
	if _, err := qtx.LockOwnedEventForBannerChange(r.Context(), db.LockOwnedEventForBannerChangeParams{
		ID: eventUUID, OrganizerID: organizerUUID,
	}); err != nil {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul nu mai poate fi modificat")
		return
	}
	var currentExternalURL pgtype.Text
	if err := tx.QueryRow(r.Context(), `SELECT external_ticket_url FROM events WHERE id = $1`, eventUUID).Scan(&currentExternalURL); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Modul de vanzare al evenimentului nu a putut fi verificat")
		return
	}
	if externalURL.Valid && !currentExternalURL.Valid {
		var hasSpottrTicketingArtifacts bool
		if err := tx.QueryRow(r.Context(), `
			SELECT EXISTS (SELECT 1 FROM ticket_types WHERE event_id = $1)
			    OR EXISTS (SELECT 1 FROM orders WHERE event_id = $1)
			    OR EXISTS (SELECT 1 FROM invitation_tickets WHERE event_id = $1)
			    OR EXISTS (SELECT 1 FROM promo_codes WHERE event_id = $1)`, eventUUID).Scan(&hasSpottrTicketingArtifacts); err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Istoricul de ticketing al evenimentului nu a putut fi verificat")
			return
		}
		if hasSpottrTicketingArtifacts {
			router.RespondWithError(w, http.StatusConflict, "Un eveniment care are deja tipuri de bilete, comenzi, invitatii sau coduri promo Spottr nu poate fi mutat pe vanzare externa")
			return
		}
	}
	currentBannerAsset, err := currentEventBannerAsset(r.Context(), qtx, eventUUID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Bannerul curent nu a putut fi verificat")
		return
	}
	requestedBannerURL := ""
	if req.BannerURL != nil {
		requestedBannerURL = *req.BannerURL
	}
	claimedBannerAsset, err := claimEventBannerAsset(r.Context(), qtx, organizerUUID, currentBannerAsset, requestedBannerURL)
	if errors.Is(err, errEventBannerAssetUnavailable) {
		router.RespondWithError(w, http.StatusBadRequest, "Bannerul nu mai este disponibil. Incarca-l din nou")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Bannerul nu a putut fi rezervat")
		return
	}
	bannerURL := pgtype.Text{}
	if req.BannerURL != nil && *req.BannerURL != "" {
		bannerURL = pgtype.Text{String: *req.BannerURL, Valid: true}
	}

	// 4. Update Eveniment
	event, err := qtx.EditEvent(r.Context(), db.EditEventParams{
		VatPercentage:              vat,
		ExternalTicketUrl:          externalURL,
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
	if err := applyEventBannerReference(r.Context(), qtx, eventUUID, currentBannerAsset, claimedBannerAsset); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Bannerul evenimentului nu a putut fi actualizat")
		return
	}
	// Safety-group retention follows the canonical event end time. Keep this in
	// the same transaction so postponing an event cannot leave an older cleanup
	// deadline visible to another API task.
	if _, err := tx.Exec(r.Context(), `
		UPDATE event_safety_groups
		SET expires_at = $2::timestamptz + interval '24 hours'
		WHERE event_id = $1`, eventUUID, endTime); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Perioada grupului de siguranta nu a putut fi actualizata")
		return
	}
	if _, err := tx.Exec(r.Context(), `
		UPDATE event_safety_messages message
		SET expires_at = $2::timestamptz + interval '24 hours'
		FROM event_safety_groups group_row
		WHERE message.group_id = group_row.id AND group_row.event_id = $1`, eventUUID, endTime); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Retentia mesajelor nu a putut fi actualizata")
		return
	}
	if _, err := tx.Exec(r.Context(), `
		UPDATE notifications
		SET expires_at = $2::timestamptz + interval '24 hours'
		WHERE event_id = $1 AND type LIKE 'safety_%'`, eventUUID, endTime); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Retentia notificarilor nu a putut fi actualizata")
		return
	}

	// 5. Procesare Bilete (Upsert: Update dacă are ID, Insert dacă nu are ID)
	for _, t := range req.TicketTypes {
		startSales, _ := time.Parse(time.RFC3339, t.StartSales)
		endSales, _ := time.Parse(time.RFC3339, t.EndSales)

		var ticketUUID pgtype.UUID
		if t.ID != nil && *t.ID != "" {
			if err := ticketUUID.Scan(*t.ID); err != nil || !ticketUUID.Valid {
				router.RespondWithError(w, http.StatusBadRequest, "ID-ul tipului de bilet este invalid")
				return
			}
		}

		if ticketUUID.Valid {
			var rowsAffected int64
			rowsAffected, err = qtx.UpdateTicketTypeForEvent(r.Context(), db.UpdateTicketTypeForEventParams{
				ID:          ticketUUID,
				Name:        t.Name,
				PriceRon:    t.PriceRon,
				Capacity:    t.Capacity,
				Description: pgtype.Text{String: t.Description, Valid: true},
				StartSales:  pgtype.Timestamptz{Time: startSales, Valid: true},
				EndSales:    pgtype.Timestamptz{Time: endSales, Valid: true},
				EventID:     eventUUID,
			})
			if err == nil && rowsAffected != 1 {
				router.RespondWithError(w, http.StatusBadRequest, "Tipul de bilet nu apartine acestui eveniment")
				return
			}
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
		if err := saveEventLineup(r.Context(), qtx, eventUUID, organizerUUID, *req.Lineup, true); err != nil {
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
	var organizerUUID pgtype.UUID
	if err := organizerUUID.Scan(userID); err != nil || !organizerUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID organizator invalid")
		return
	}
	if _, err := qtx.LockOwnedEventForBannerChange(r.Context(), db.LockOwnedEventForBannerChangeParams{
		ID: eventUUID, OrganizerID: organizerUUID,
	}); err != nil {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul nu mai poate fi sters")
		return
	}
	currentBannerAsset, err := currentEventBannerAsset(r.Context(), qtx, eventUUID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Bannerul curent nu a putut fi verificat")
		return
	}
	if _, err := claimEventBannerAsset(r.Context(), qtx, organizerUUID, currentBannerAsset, ""); err != nil {
		router.RespondWithError(w, http.StatusConflict, "Bannerul evenimentului este procesat. Incearca din nou")
		return
	}
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

	// Cloakroom commands take the same event lock, so no allocation can race
	// this check. Keep every custody record, including cancelled/returned ones,
	// but allow deletion of an unused event that only has cloakroom setup.
	var wardrobeHistory bool
	if err := tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM wardrobe_deposits WHERE event_id=$1)`, eventUUID).Scan(&wardrobeHistory); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Istoricul garderobei nu a putut fi verificat")
		return
	}
	if wardrobeHistory {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul are depozitari sau istoric de garderoba si nu poate fi sters")
		return
	}
	for _, statement := range []string{
		`DELETE FROM wardrobe_audit WHERE event_id=$1`,
		`DELETE FROM wardrobe_staff WHERE event_id=$1`,
		`DELETE FROM wardrobe_zones WHERE event_id=$1`, // slots cascade with their zone
	} {
		if _, err := tx.Exec(r.Context(), statement, eventUUID); err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Configurarea garderobei nu a putut fi eliminata")
			return
		}
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
	if err := applyEventBannerReference(r.Context(), qtx, eventUUID, currentBannerAsset, pgtype.UUID{}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Bannerul evenimentului nu a putut fi programat pentru stergere")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Eroare la finalizarea stergerii evenimentului")
		return
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
	searchPattern, searchErr := eventSearchPattern(r.URL.Query().Get("q"))
	if searchErr != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Cautarea poate avea cel mult 120 de caractere")
		return
	}
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
	pageSize := int32(20)
	if organizerID.Valid {
		pageSize = 100
	}
	offset, pageErr := eventPageOffset(pageStr, pageSize)
	if pageErr != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Pagina invalida")
		return
	}

	params := db.ListEventsParams{
		Category:      category,
		City:          city,
		Vibe:          vibe,
		SearchPattern: searchPattern,
		StartsAfter:   startsAfter,
		StartsBefore:  startsBefore,
		ReqLimit:      pageSize,
		ReqOffset:     offset,
		OrganizerID:   organizerID,
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

	// Include ALL query arguments, especially viewer identity and map bounds.
	// Personalized fields must never be shared between accounts.
	cacheKey, _ := json.Marshal(params)
	listCache := h.lists
	if strings.Contains(r.Header.Get("Cache-Control"), "no-cache") {
		listCache = nil
	}
	dbEvents, err := listCache.Get(r.Context(), string(cacheKey), func(ctx context.Context) ([]db.ListEventsRow, error) {
		return h.Queries.ListEvents(ctx, params)
	})
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
	params := db.GetEventByIDParams{
		UserID: pgUserID,
		ID:     eventUUID,
	}
	cacheKey, _ := json.Marshal(params)
	detailCache := h.details
	if strings.Contains(r.Header.Get("Cache-Control"), "no-cache") {
		detailCache = nil
	}
	dbRow, err := detailCache.Get(r.Context(), string(cacheKey), func(ctx context.Context) (db.GetEventByIDRow, error) {
		return h.Queries.GetEventByID(ctx, params)
	})
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost găsit")
		return
	}

	dbRow.IsLive = pgtype.Bool{Bool: time.Now().After(dbRow.StartTime.Time) && time.Now().Before(dbRow.EndTime.Time), Valid: true}

	// Event content is cached briefly, but checkout pricing must reflect the latest
	// admin settings, including immediately after a stale quote was rejected.
	commission, err := h.Queries.GetEffectiveCommission(r.Context(), dbRow.OrganizerID)
	if err != nil {
		router.RespondWithError(w, http.StatusServiceUnavailable, "COMMISSION_UNAVAILABLE")
		return
	}
	dbRow.CommissionRateBps = commission.RateBps
	dbRow.CommissionPerTicketBani = commission.PerTicketBani

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
