package promotions

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	eventapi "pulse-api/internal/events"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"
)

const promotionCheckoutExpiration = 30 * time.Minute

type Handler struct {
	queries    *db.Queries
	client     *stripe.Client
	appURL     string
	configured bool
}

type PlanResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	AmountRon   int32  `json:"amountRon"`
	Days        int32  `json:"days"`
}

type CampaignResponse struct {
	ID               string    `json:"id"`
	EventID          string    `json:"eventId"`
	EventTitle       string    `json:"eventTitle"`
	Plan             string    `json:"plan"`
	Status           string    `json:"status"`
	StartsAt         time.Time `json:"startsAt"`
	EndsAt           time.Time `json:"endsAt"`
	AmountRon        int32     `json:"amountRon"`
	ImpressionsCount int64     `json:"impressionsCount"`
	ClicksCount      int64     `json:"clicksCount"`
	CTR              float64   `json:"ctr"`
	CreatedAt        time.Time `json:"createdAt"`
}

type PromotedEventResponse struct {
	CampaignID string                 `json:"campaignId"`
	Event      eventapi.EventResponse `json:"event"`
}

func NewHandler(queries *db.Queries, stripeSecret, appURL string) *Handler {
	if appURL == "" {
		appURL = "http://localhost:3000"
	}
	return &Handler{queries: queries, client: stripe.NewClient(stripeSecret), appURL: strings.TrimRight(appURL, "/"), configured: stripeSecret != ""}
}

func envPrice(name string, fallback int32) int32 {
	value, err := strconv.ParseInt(strings.TrimSpace(os.Getenv(name)), 10, 32)
	if err != nil || value <= 0 {
		return fallback
	}
	return int32(value)
}

func plans() []PlanResponse {
	return []PlanResponse{
		{ID: "one_day", Name: "O zi", Description: "Promovare timp de 24 de ore", AmountRon: envPrice("PROMOTION_ONE_DAY_PRICE_RON", 50), Days: 1},
		{ID: "thu_sat", Name: "Joi – sâmbătă", Description: "Vizibilitate în cele trei zile principale de ieșit", AmountRon: envPrice("PROMOTION_THU_SAT_PRICE_RON", 120), Days: 3},
		{ID: "full_week", Name: "Toată săptămâna", Description: "Promovare continuă timp de șapte zile", AmountRon: envPrice("PROMOTION_FULL_WEEK_PRICE_RON", 200), Days: 7},
	}
}

func planByID(id string) (PlanResponse, bool) {
	for _, plan := range plans() {
		if plan.ID == id {
			return plan, true
		}
	}
	return PlanResponse{}, false
}

func authenticatedUserID(ctx context.Context) (pgtype.UUID, bool) {
	value, err := auth.GetUserIDFromContext(ctx)
	var id pgtype.UUID
	if err != nil || id.Scan(value) != nil || !id.Valid {
		return id, false
	}
	return id, true
}

func bucharestLocation() *time.Location {
	location, err := time.LoadLocation("Europe/Bucharest")
	if err != nil {
		return time.UTC
	}
	return location
}

func campaignInterval(planID, startDate string) (time.Time, time.Time, error) {
	start, err := time.ParseInLocation("2006-01-02", startDate, bucharestLocation())
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("data de start este invalida")
	}
	today := time.Now().In(bucharestLocation())
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, today.Location())
	if start.Before(today) {
		return time.Time{}, time.Time{}, fmt.Errorf("data de start trebuie sa fie astazi sau in viitor")
	}
	days := 0
	switch planID {
	case "one_day":
		days = 1
	case "thu_sat":
		if start.Weekday() != time.Thursday {
			return time.Time{}, time.Time{}, fmt.Errorf("planul joi-sambata trebuie sa inceapa intr-o zi de joi")
		}
		days = 3
	case "full_week":
		days = 7
	default:
		return time.Time{}, time.Time{}, fmt.Errorf("plan invalid")
	}
	return start, start.AddDate(0, 0, days), nil
}

func (h *Handler) refreshStatuses(ctx context.Context) {
	_ = h.queries.ActivateScheduledPromotionCampaigns(ctx)
	_ = h.queries.CompleteExpiredPromotionCampaigns(ctx)
}

func (h *Handler) HandleListPlans(w http.ResponseWriter, r *http.Request) {
	router.RespondWithJSON(w, http.StatusOK, plans())
}

func (h *Handler) HandleCreateCheckout(w http.ResponseWriter, r *http.Request) {
	if !h.configured {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Platile Stripe nu sunt configurate")
		return
	}
	organizerID, ok := authenticatedUserID(r.Context())
	if !ok {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	var body struct {
		EventID   string `json:"eventId"`
		Plan      string `json:"plan"`
		StartDate string `json:"startDate"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Datele promovarii sunt invalide")
		return
	}
	plan, exists := planByID(body.Plan)
	if !exists {
		router.RespondWithError(w, http.StatusBadRequest, "Plan invalid")
		return
	}
	startsAt, endsAt, err := campaignInterval(plan.ID, body.StartDate)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	var eventID pgtype.UUID
	if eventID.Scan(body.EventID) != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "Eveniment invalid")
		return
	}
	event, err := h.queries.GetEventWithStats(r.Context(), eventID)
	if err != nil || event.OrganizerID != organizerID {
		router.RespondWithError(w, http.StatusForbidden, "Nu poti promova acest eveniment")
		return
	}
	if event.Status != "published" || event.EndTime.Time.Before(endsAt) {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul trebuie sa fie publicat si activ pe intreaga perioada aleasa")
		return
	}
	overlap, err := h.queries.PromotionCampaignOverlaps(r.Context(), db.PromotionCampaignOverlapsParams{
		EventID:  eventID,
		StartsAt: pgtype.Timestamptz{Time: startsAt, Valid: true},
		EndsAt:   pgtype.Timestamptz{Time: endsAt, Valid: true},
	})
	if err != nil || overlap {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul are deja o promovare in intervalul ales")
		return
	}
	campaignID, err := h.queries.CreatePromotionCampaign(r.Context(), db.CreatePromotionCampaignParams{
		EventID:     eventID,
		OrganizerID: organizerID,
		Plan:        db.PromotionPlan(plan.ID),
		StartsAt:    pgtype.Timestamptz{Time: startsAt, Valid: true},
		EndsAt:      pgtype.Timestamptz{Time: endsAt, Valid: true},
		AmountBani:  plan.AmountRon * 100,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Promovarea nu a putut fi pregatita")
		return
	}
	campaignIDString := common.UUIDToString(campaignID)
	params := &stripe.CheckoutSessionCreateParams{
		Mode:               stripe.String("payment"),
		SuccessURL:         stripe.String(h.appURL + "/dashboard/promotions?payment=success"),
		CancelURL:          stripe.String(h.appURL + "/dashboard/promotions?payment=cancelled"),
		ExpiresAt:          stripe.Int64(time.Now().Add(promotionCheckoutExpiration).Unix()),
		PaymentMethodTypes: []*string{stripe.String("card")},
		Metadata:           map[string]string{"pulse_promotion_campaign_id": campaignIDString},
		PaymentIntentData:  &stripe.CheckoutSessionCreatePaymentIntentDataParams{Metadata: map[string]string{"pulse_promotion_campaign_id": campaignIDString}},
		LineItems:          []*stripe.CheckoutSessionCreateLineItemParams{{Quantity: stripe.Int64(1), PriceData: &stripe.CheckoutSessionCreateLineItemPriceDataParams{Currency: stripe.String("ron"), UnitAmount: stripe.Int64(int64(plan.AmountRon) * 100), ProductData: &stripe.CheckoutSessionCreateLineItemPriceDataProductDataParams{Name: stripe.String("Promovare Pulse - " + plan.Name), Description: stripe.String(event.Title)}}}},
	}
	params.SetIdempotencyKey("pulse-promotion-" + campaignIDString)
	session, err := h.client.V1CheckoutSessions.Create(r.Context(), params)
	if err != nil {
		_ = h.queries.CancelPendingPromotionCampaign(r.Context(), campaignID)
		router.RespondWithError(w, http.StatusBadGateway, "Sesiunea Stripe nu a putut fi creata")
		return
	}
	if err := h.queries.SavePromotionCheckoutSession(r.Context(), db.SavePromotionCheckoutSessionParams{
		ID:                      campaignID,
		StripeCheckoutSessionID: pgtype.Text{String: session.ID, Valid: true},
	}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Sesiunea Stripe nu a putut fi salvata")
		return
	}
	router.RespondWithJSON(w, http.StatusCreated, map[string]string{"checkoutUrl": session.URL, "campaignId": campaignIDString})
}

func (h *Handler) FulfillCampaign(ctx context.Context, campaignID, sessionID, paymentIntentID string) error {
	var id pgtype.UUID
	if id.Scan(campaignID) != nil || !id.Valid {
		return nil
	}
	rowsAffected, err := h.queries.FulfillPromotionCampaign(ctx, db.FulfillPromotionCampaignParams{
		ID:                      id,
		StripeCheckoutSessionID: pgtype.Text{String: sessionID, Valid: true},
		PaymentIntentID:         paymentIntentID,
	})
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		status, statusErr := h.queries.GetPromotionCampaignStatusForCheckout(ctx, db.GetPromotionCampaignStatusForCheckoutParams{
			ID:                      id,
			StripeCheckoutSessionID: pgtype.Text{String: sessionID, Valid: true},
		})
		if statusErr == nil && status != db.PromotionStatusPendingPayment && status != db.PromotionStatusCancelled {
			return nil
		}
		return errors.New("campania nu a putut fi activata")
	}
	return nil
}

func (h *Handler) CancelCampaign(ctx context.Context, campaignID string) error {
	var id pgtype.UUID
	if id.Scan(campaignID) != nil || !id.Valid {
		return nil
	}
	return h.queries.CancelPendingPromotionCampaign(ctx, id)
}

func (h *Handler) HandleListCampaigns(w http.ResponseWriter, r *http.Request) {
	organizerID, ok := authenticatedUserID(r.Context())
	if !ok {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	h.refreshStatuses(r.Context())
	rows, err := h.queries.ListPromotionCampaigns(r.Context(), organizerID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Promovarile nu au putut fi incarcate")
		return
	}
	items := make([]CampaignResponse, 0, len(rows))
	for _, row := range rows {
		item := CampaignResponse{
			ID:               common.UUIDToString(row.ID),
			EventID:          common.UUIDToString(row.EventID),
			EventTitle:       row.EventTitle,
			Plan:             string(row.Plan),
			Status:           string(row.Status),
			StartsAt:         row.StartsAt.Time,
			EndsAt:           row.EndsAt.Time,
			AmountRon:        row.AmountBani / 100,
			ImpressionsCount: row.ImpressionsCount,
			ClicksCount:      row.ClicksCount,
			CreatedAt:        row.CreatedAt.Time,
		}
		if item.ImpressionsCount > 0 {
			item.CTR = float64(item.ClicksCount) / float64(item.ImpressionsCount) * 100
		}
		items = append(items, item)
	}
	router.RespondWithJSON(w, http.StatusOK, items)
}

func (h *Handler) HandleListActive(w http.ResponseWriter, r *http.Request) {
	h.refreshStatuses(r.Context())
	userID, _ := authenticatedUserID(r.Context())
	rows, err := h.queries.ListActivePromotionCampaignEvents(r.Context(), userID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Promovarile nu au putut fi incarcate")
		return
	}
	items := make([]PromotedEventResponse, 0, len(rows))
	for _, promotion := range rows {
		row, err := h.queries.GetEventByID(r.Context(), db.GetEventByIDParams{UserID: userID, ID: promotion.EventID})
		if err == nil {
			items = append(items, PromotedEventResponse{CampaignID: common.UUIDToString(promotion.CampaignID), Event: eventapi.MapFromDBGetEvent(row)})
		}
	}
	router.RespondWithJSON(w, http.StatusOK, items)
}

func (h *Handler) HandleTrackMetric(w http.ResponseWriter, r *http.Request) {
	var campaignID pgtype.UUID
	if campaignID.Scan(chi.URLParam(r, "id")) != nil || !campaignID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "Campanie invalida")
		return
	}
	var body struct {
		Metric    string `json:"metric"`
		ViewerKey string `json:"viewerKey"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || (body.Metric != "impression" && body.Metric != "click") || len(body.ViewerKey) < 8 || len(body.ViewerKey) > 100 {
		router.RespondWithError(w, http.StatusBadRequest, "Metric invalid")
		return
	}
	userID, _ := authenticatedUserID(r.Context())
	var err error
	if body.Metric == "click" {
		err = h.queries.RecordPromotionClick(r.Context(), db.RecordPromotionClickParams{
			CampaignID: campaignID,
			UserID:     userID,
			ViewerKey:  body.ViewerKey,
		})
	} else {
		err = h.queries.RecordPromotionImpression(r.Context(), db.RecordPromotionImpressionParams{
			CampaignID: campaignID,
			UserID:     userID,
			ViewerKey:  body.ViewerKey,
		})
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Statistica nu a putut fi salvata")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
