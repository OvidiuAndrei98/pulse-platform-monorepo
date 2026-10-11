package promotions

import (
	"context"
	"errors"
	"fmt"
	"log"
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
	"pulse-api/internal/invoicing"
	"pulse-api/internal/router"
	"pulse-api/internal/users"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stripe/stripe-go/v85"
)

const (
	promotionCheckoutExpiration  = 30 * time.Minute
	promotionReservationDuration = 10 * time.Minute
	homeBannerCapacity           = 5
)

const maxPromotionJSONBytes = 8 << 10

type promotionBillingDetailsRequest struct {
	RegistrationNumber string `json:"registrationNumber"`
	Address            string `json:"address"`
	City               string `json:"city"`
	County             string `json:"county"`
	Sector             string `json:"sector"`
	Country            string `json:"country"`
}

func normalizePromotionBillingDetails(
	details promotionBillingDetailsRequest,
	companyName string,
	companyCUI string,
) (users.BillingDetails, error) {
	return users.NormalizeBillingDetails(users.BillingDetails{
		Type:               "company",
		Name:               companyName,
		TaxID:              companyCUI,
		RegistrationNumber: details.RegistrationNumber,
		Address:            details.Address,
		City:               details.City,
		County:             details.County,
		Sector:             details.Sector,
		Country:            details.Country,
	})
}

type Handler struct {
	queries    *db.Queries
	pool       *pgxpool.Pool
	client     *stripe.Client
	appURL     string
	configured bool
	invoicing  *invoicing.Service
	liveMode   bool
	modeKnown  bool
}

type PlanResponse struct {
	ID          string `json:"id"`
	Placement   string `json:"placement"`
	Name        string `json:"name"`
	Description string `json:"description"`
	AmountRon   int32  `json:"amountRon"`
	Days        int32  `json:"days"`
}

type CampaignResponse struct {
	ID                  string     `json:"id"`
	EventID             string     `json:"eventId"`
	EventTitle          string     `json:"eventTitle"`
	Plan                string     `json:"plan"`
	Placement           string     `json:"placement"`
	Status              string     `json:"status"`
	StartsAt            time.Time  `json:"startsAt"`
	EndsAt              time.Time  `json:"endsAt"`
	AmountRon           int32      `json:"amountRon"`
	ImpressionsCount    int64      `json:"impressionsCount"`
	ClicksCount         int64      `json:"clicksCount"`
	CTR                 float64    `json:"ctr"`
	CreatedAt           time.Time  `json:"createdAt"`
	InvoiceStatus       string     `json:"invoiceStatus,omitempty"`
	InvoiceSeries       string     `json:"invoiceSeries,omitempty"`
	InvoiceNumber       string     `json:"invoiceNumber,omitempty"`
	InvoiceDocumentURL  string     `json:"invoiceDocumentUrl,omitempty"`
	InvoiceIssuedAt     *time.Time `json:"invoiceIssuedAt,omitempty"`
	InvoiceRefundStatus string     `json:"invoiceRefundStatus,omitempty"`
	InvoiceRefundedRon  float64    `json:"invoiceRefundedRon,omitempty"`
	AttentionRequired   bool       `json:"attentionRequired"`
	AttentionReason     string     `json:"attentionReason,omitempty"`
}

type PromotedEventResponse struct {
	CampaignID string                 `json:"campaignId"`
	Placement  string                 `json:"placement"`
	Event      eventapi.EventResponse `json:"event"`
}

type InvoiceAttentionResponse struct {
	ID                string  `json:"id"`
	CampaignID        string  `json:"campaignId"`
	EventTitle        string  `json:"eventTitle"`
	OrganizerID       string  `json:"organizerId"`
	CustomerEmail     string  `json:"customerEmail"`
	AmountRon         float64 `json:"amountRon"`
	PaymentIntentID   string  `json:"paymentIntentId,omitempty"`
	InvoiceStatus     string  `json:"invoiceStatus,omitempty"`
	RefundStatus      string  `json:"refundStatus,omitempty"`
	RefundedAmountRon float64 `json:"refundedAmountRon"`
	Reason            string  `json:"reason"`
	CreatedAt         string  `json:"createdAt"`
	UpdatedAt         string  `json:"updatedAt"`
}

func NewHandler(queries *db.Queries, pool *pgxpool.Pool, stripeSecret, appURL string, invoicingService *invoicing.Service) *Handler {
	if appURL == "" {
		appURL = "http://localhost:3000"
	}
	liveMode, modeKnown := stripeSecretLiveMode(stripeSecret)
	return &Handler{queries: queries, pool: pool, client: stripe.NewClient(stripeSecret), appURL: strings.TrimRight(appURL, "/"), configured: stripeSecret != "", invoicing: invoicingService, liveMode: liveMode, modeKnown: modeKnown}
}

func stripeSecretLiveMode(secret string) (bool, bool) {
	secret = strings.TrimSpace(secret)
	switch {
	case strings.HasPrefix(secret, "sk_live_"), strings.HasPrefix(secret, "rk_live_"):
		return true, true
	case strings.HasPrefix(secret, "sk_test_"), strings.HasPrefix(secret, "rk_test_"):
		return false, true
	default:
		return false, false
	}
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
		{ID: "one_day", Placement: "home_banner", Name: "O zi", Description: "Banner principal timp de 24 de ore", AmountRon: envPrice("PROMOTION_ONE_DAY_PRICE_RON", 50), Days: 1},
		{ID: "thu_sat", Placement: "home_banner", Name: "Joi - sambata", Description: "Banner principal in cele trei zile de varf", AmountRon: envPrice("PROMOTION_THU_SAT_PRICE_RON", 120), Days: 3},
		{ID: "full_week", Placement: "home_banner", Name: "Toata saptamana", Description: "Banner principal timp de sapte zile", AmountRon: envPrice("PROMOTION_FULL_WEEK_PRICE_RON", 200), Days: 7},
		{ID: "one_day", Placement: "feed", Name: "O zi", Description: "Pozitionare prioritara in liste timp de 24 de ore", AmountRon: envPrice("PROMOTION_FEED_ONE_DAY_PRICE_RON", 10), Days: 1},
		{ID: "thu_sat", Placement: "feed", Name: "Joi - sambata", Description: "Pozitionare prioritara in liste in cele trei zile de varf", AmountRon: envPrice("PROMOTION_FEED_THU_SAT_PRICE_RON", 25), Days: 3},
		{ID: "full_week", Placement: "feed", Name: "Toata saptamana", Description: "Pozitionare prioritara in liste timp de sapte zile", AmountRon: envPrice("PROMOTION_FEED_FULL_WEEK_PRICE_RON", 50), Days: 7},
	}
}

func planByID(id, placement string) (PlanResponse, bool) {
	for _, plan := range plans() {
		if plan.ID == id && plan.Placement == placement {
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

func (h *Handler) expireCheckoutReservations(ctx context.Context) {
	if !h.configured {
		return
	}
	expiresBefore := pgtype.Timestamptz{
		Time:  time.Now().Add(-promotionReservationDuration),
		Valid: true,
	}
	if err := h.queries.CancelAbandonedPromotionReservations(ctx, expiresBefore); err != nil {
		log.Printf("abandoned promotion reservation cleanup failed: %v", err)
	}
	rows, err := h.queries.ListExpiredPromotionCheckoutReservations(ctx, expiresBefore)
	if err != nil {
		log.Printf("promotion reservation cleanup query failed: %v", err)
		return
	}
	for _, row := range rows {
		sessionID := row.StripeCheckoutSessionID.String
		requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		session, sessionErr := h.client.V1CheckoutSessions.Expire(requestCtx, sessionID, nil)
		if sessionErr != nil {
			session, sessionErr = h.client.V1CheckoutSessions.Retrieve(requestCtx, sessionID, nil)
		}
		cancel()
		if sessionErr != nil || session == nil {
			log.Printf("promotion checkout expiration failed: session=%s error=%v", sessionID, sessionErr)
			continue
		}
		switch session.Status {
		case stripe.CheckoutSessionStatusExpired:
			if err := h.queries.CancelPendingPromotionCampaign(ctx, row.ID); err != nil {
				log.Printf("promotion reservation cancellation failed: session=%s error=%v", sessionID, err)
			}
		case stripe.CheckoutSessionStatusComplete:
			if session.PaymentStatus != stripe.CheckoutSessionPaymentStatusPaid {
				continue
			}
			paymentIntentID := ""
			if session.PaymentIntent != nil {
				paymentIntentID = session.PaymentIntent.ID
			}
			if err := h.FulfillCampaign(ctx, common.UUIDToString(row.ID), sessionID, paymentIntentID, session.Livemode); err != nil {
				log.Printf("promotion reservation fulfillment failed: session=%s error=%v", sessionID, err)
			}
		}
	}
}

func (h *Handler) StartReservationExpiryWorker(ctx context.Context) {
	go func() {
		h.expireCheckoutReservations(ctx)
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.expireCheckoutReservations(ctx)
			}
		}
	}()
}

func (h *Handler) HandleListPlans(w http.ResponseWriter, r *http.Request) {
	router.RespondWithJSON(w, http.StatusOK, plans())
}

func (h *Handler) HandleAvailability(w http.ResponseWriter, r *http.Request) {
	plan, exists := planByID(r.URL.Query().Get("plan"), "home_banner")
	if !exists {
		router.RespondWithError(w, http.StatusBadRequest, "Plan invalid")
		return
	}
	startsAt, endsAt, err := campaignInterval(plan.ID, r.URL.Query().Get("startDate"))
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	peakOccupancy, err := h.queries.HomeBannerPromotionPeakOccupancy(r.Context(), db.HomeBannerPromotionPeakOccupancyParams{
		StartsAt: pgtype.Timestamptz{Time: startsAt, Valid: true},
		EndsAt:   pgtype.Timestamptz{Time: endsAt, Valid: true},
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Locurile din banner nu au putut fi verificate")
		return
	}
	availableSlots := int64(homeBannerCapacity) - peakOccupancy
	if availableSlots < 0 {
		availableSlots = 0
	}
	router.RespondWithJSON(w, http.StatusOK, map[string]int64{
		"capacity":       homeBannerCapacity,
		"availableSlots": availableSlots,
	})
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
		EventID        string                         `json:"eventId"`
		Client         string                         `json:"client,omitempty"`
		Plan           string                         `json:"plan"`
		Placement      string                         `json:"placement"`
		StartDate      string                         `json:"startDate"`
		BillingDetails promotionBillingDetailsRequest `json:"billingDetails"`
	}
	if !router.DecodeJSON(w, r, &body, maxPromotionJSONBytes) {
		return
	}
	if !common.ValidOrganizerClient(body.Client) {
		router.RespondWithError(w, http.StatusBadRequest, "Client invalid")
		return
	}
	var invoiceConfig invoicing.PromotionInvoiceConfig
	if h.modeKnown && h.liveMode {
		configuredInvoice, configErr := h.invoicing.PromotionInvoiceConfig()
		if configErr != nil {
			router.RespondWithError(w, http.StatusServiceUnavailable, "Facturarea SPOTTR nu este disponibila momentan")
			return
		}
		invoiceConfig = configuredInvoice
	}
	plan, exists := planByID(body.Plan, body.Placement)
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
	organizer, err := h.queries.GetUserByID(r.Context(), organizerID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Datele organizatorului nu au putut fi incarcate")
		return
	}
	organizerProfile, err := h.queries.GetOrganizerProfile(r.Context(), organizerID)
	if err != nil || organizerProfile.VerificationStatus != db.VerificationStatusTypeApproved {
		router.RespondWithError(w, http.StatusForbidden, "Firma organizatorului trebuie sa fie verificata")
		return
	}
	billing, err := normalizePromotionBillingDetails(
		body.BillingDetails,
		organizerProfile.CompanyName,
		organizerProfile.Cui,
	)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	if event.Status != "published" || event.EndTime.Time.Before(endsAt) {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul trebuie sa fie publicat si activ pe intreaga perioada aleasa")
		return
	}
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Promovarea nu a putut fi rezervata")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.queries.WithTx(tx)
	if err := qtx.LockPromotionEvent(r.Context(), eventID); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Promovarea nu a putut fi rezervata")
		return
	}
	overlap, err := qtx.PromotionCampaignOverlaps(r.Context(), db.PromotionCampaignOverlapsParams{
		EventID:  eventID,
		StartsAt: pgtype.Timestamptz{Time: startsAt, Valid: true},
		EndsAt:   pgtype.Timestamptz{Time: endsAt, Valid: true},
	})
	if err != nil || overlap {
		router.RespondWithError(w, http.StatusConflict, "Evenimentul are deja o promovare in intervalul ales")
		return
	}
	if body.Placement == "home_banner" {
		if err := qtx.LockHomeBannerPromotionCapacity(r.Context()); err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Locurile din banner nu au putut fi verificate")
			return
		}
		peakOccupancy, err := qtx.HomeBannerPromotionPeakOccupancy(r.Context(), db.HomeBannerPromotionPeakOccupancyParams{
			StartsAt: pgtype.Timestamptz{Time: startsAt, Valid: true},
			EndsAt:   pgtype.Timestamptz{Time: endsAt, Valid: true},
		})
		if err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Locurile din banner nu au putut fi verificate")
			return
		}
		if peakOccupancy >= homeBannerCapacity {
			router.RespondWithError(w, http.StatusConflict, "Cele 5 locuri din banner sunt deja rezervate pentru perioada aleasa")
			return
		}
	}
	campaignID, err := qtx.CreatePromotionCampaign(r.Context(), db.CreatePromotionCampaignParams{
		EventID:                     eventID,
		OrganizerID:                 organizerID,
		Plan:                        db.PromotionPlan(plan.ID),
		Placement:                   db.PromotionPlacement(plan.Placement),
		StartsAt:                    pgtype.Timestamptz{Time: startsAt, Valid: true},
		EndsAt:                      pgtype.Timestamptz{Time: endsAt, Valid: true},
		AmountBani:                  plan.AmountRon * 100,
		BillingEmail:                organizer.Email,
		BillingType:                 billing.Type,
		BillingName:                 billing.Name,
		BillingTaxID:                billing.TaxID,
		BillingRegistrationNumber:   billing.RegistrationNumber,
		BillingAddress:              billing.Address,
		BillingCity:                 billing.City,
		BillingCounty:               billing.County,
		BillingSector:               billing.Sector,
		BillingCountry:              billing.Country,
		InvoiceProvider:             invoiceConfig.Provider,
		InvoiceIssuerAccountEmail:   invoiceConfig.AccountEmail,
		InvoiceIssuerCompanyVatCode: invoiceConfig.CompanyVATCode,
		InvoiceIssuerSeriesName:     invoiceConfig.SeriesName,
		InvoiceVatName:              invoiceConfig.VATName,
		InvoiceVatPercentage:        numeric(invoiceConfig.VATPercentage),
		InvoiceSendEmail:            invoiceConfig.SendEmail,
		InvoiceSendToSpv:            invoiceConfig.SendToSPV,
		InvoicePaymentType:          invoiceConfig.PaymentType,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Promovarea nu a putut fi pregatita")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Promovarea nu a putut fi rezervata")
		return
	}
	campaignIDString := common.UUIDToString(campaignID)
	params := &stripe.CheckoutSessionCreateParams{
		Mode:               stripe.String("payment"),
		SuccessURL:         stripe.String(common.OrganizerReturnURL(h.appURL, body.Client, "promotion", "complete", campaignIDString)),
		CancelURL:          stripe.String(common.OrganizerReturnURL(h.appURL, body.Client, "promotion", "cancelled", campaignIDString)),
		CustomerEmail:      stripe.String(organizer.Email),
		ExpiresAt:          stripe.Int64(time.Now().Add(promotionCheckoutExpiration).Unix()),
		PaymentMethodTypes: []*string{stripe.String("card")},
		Metadata:           map[string]string{"pulse_promotion_campaign_id": campaignIDString},
		PaymentIntentData:  &stripe.CheckoutSessionCreatePaymentIntentDataParams{Metadata: map[string]string{"pulse_promotion_campaign_id": campaignIDString}, ReceiptEmail: stripe.String(organizer.Email)},
		LineItems:          []*stripe.CheckoutSessionCreateLineItemParams{{Quantity: stripe.Int64(1), PriceData: &stripe.CheckoutSessionCreateLineItemPriceDataParams{Currency: stripe.String("ron"), UnitAmount: stripe.Int64(int64(plan.AmountRon) * 100), ProductData: &stripe.CheckoutSessionCreateLineItemPriceDataProductDataParams{Name: stripe.String("Promovare SPOTTR - " + plan.Name), Description: stripe.String(event.Title + " - " + plan.Placement)}}}},
	}
	params.SetIdempotencyKey("pulse-promotion-" + campaignIDString)
	session, err := h.client.V1CheckoutSessions.Create(r.Context(), params)
	if err != nil {
		_ = h.flagCheckoutReview(r.Context(), campaignID, "stripe_session_create_outcome_unknown", "", "", pgtype.Bool{})
		router.RespondWithError(w, http.StatusBadGateway, "Sesiunea Stripe nu a putut fi creata")
		return
	}
	if err := h.queries.SavePromotionCheckoutSession(r.Context(), db.SavePromotionCheckoutSessionParams{
		ID:                      campaignID,
		StripeCheckoutSessionID: pgtype.Text{String: session.ID, Valid: true},
		StripeLivemode:          pgtype.Bool{Bool: session.Livemode, Valid: true},
	}); err != nil {
		expired, expireErr := h.client.V1CheckoutSessions.Expire(r.Context(), session.ID, nil)
		if expireErr == nil && expired != nil && expired.Status == stripe.CheckoutSessionStatusExpired {
			_ = h.queries.CancelPendingPromotionCampaign(r.Context(), campaignID)
		} else {
			_ = h.flagCheckoutReview(r.Context(), campaignID, "stripe_session_persistence_outcome_unknown", session.ID, "", pgtype.Bool{Bool: session.Livemode, Valid: true})
		}
		router.RespondWithError(w, http.StatusInternalServerError, "Sesiunea Stripe nu a putut fi salvata")
		return
	}
	if session.Livemode && invoiceConfig.Provider == "" {
		expired, expireErr := h.client.V1CheckoutSessions.Expire(r.Context(), session.ID, nil)
		if expireErr == nil && expired != nil && expired.Status == stripe.CheckoutSessionStatusExpired {
			_ = h.queries.CancelPendingPromotionCampaignForCheckout(r.Context(), db.CancelPendingPromotionCampaignForCheckoutParams{ID: campaignID, StripeCheckoutSessionID: session.ID})
		} else {
			_ = h.flagCheckoutReview(r.Context(), campaignID, "live_checkout_without_fiscal_config", session.ID, "", pgtype.Bool{Bool: true, Valid: true})
		}
		router.RespondWithError(w, http.StatusServiceUnavailable, "Facturarea SPOTTR nu este disponibila momentan")
		return
	}
	router.RespondWithJSON(w, http.StatusCreated, map[string]string{"checkoutUrl": session.URL, "campaignId": campaignIDString})
}

func (h *Handler) flagCheckoutReview(ctx context.Context, campaignID pgtype.UUID, reason, sessionID, paymentIntentID string, liveMode pgtype.Bool) error {
	return h.queries.FlagPromotionCheckoutReview(ctx, db.FlagPromotionCheckoutReviewParams{
		CampaignID: campaignID, Reason: reason, StripeCheckoutSessionID: sessionID,
		StripePaymentIntentID: paymentIntentID, StripeLivemode: liveMode,
	})
}

func (h *Handler) FulfillCampaign(ctx context.Context, campaignID, sessionID, paymentIntentID string, liveMode bool) error {
	var id pgtype.UUID
	if id.Scan(campaignID) != nil || !id.Valid {
		return nil
	}
	paymentIntentID = strings.TrimSpace(paymentIntentID)
	if liveMode && paymentIntentID == "" {
		return errors.New("plata live a promovarii nu are PaymentIntent")
	}
	if h.pool == nil {
		return errors.New("baza de date pentru promovari nu este disponibila")
	}
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	qtx := h.queries.WithTx(tx)
	if paymentIntentID != "" {
		if err := qtx.LockPromotionPaymentIntent(ctx, paymentIntentID); err != nil {
			return err
		}
	}

	fulfilled, err := qtx.FulfillPromotionCampaign(ctx, db.FulfillPromotionCampaignParams{
		ID:                      id,
		StripeCheckoutSessionID: sessionID,
		PaymentIntentID:         paymentIntentID,
		StripeLivemode:          liveMode,
	})
	if err != nil {
		return err
	}
	if !fulfilled {
		legacyRows, legacyErr := qtx.FulfillLegacyPromotionCampaignForReview(ctx, db.FulfillLegacyPromotionCampaignForReviewParams{
			ID: id, StripeCheckoutSessionID: pgtype.Text{String: sessionID, Valid: sessionID != ""},
			PaymentIntentID: pgtype.Text{String: paymentIntentID, Valid: paymentIntentID != ""},
			StripeLivemode:  pgtype.Bool{Bool: liveMode, Valid: true},
		})
		if legacyErr != nil {
			return legacyErr
		}
		if legacyRows == 1 {
			if err := tx.Commit(ctx); err != nil {
				return err
			}
			return nil
		}
		refunded, refundErr := qtx.PromotionRefundStateExists(ctx, paymentIntentID)
		if refundErr != nil {
			return refundErr
		}
		if refunded {
			_, cancelErr := qtx.CancelPromotionCampaignForKnownRefund(ctx, db.CancelPromotionCampaignForKnownRefundParams{
				PaymentIntentID: paymentIntentID, StripeLivemode: liveMode, ID: id, StripeCheckoutSessionID: sessionID,
			})
			if cancelErr != nil {
				return cancelErr
			}
			return tx.Commit(ctx)
		}
		status, statusErr := qtx.GetPromotionCampaignStatusForCheckout(ctx, db.GetPromotionCampaignStatusForCheckoutParams{
			ID:                      id,
			StripeCheckoutSessionID: pgtype.Text{String: sessionID, Valid: true},
		})
		if statusErr == nil && status != db.PromotionStatusPendingPayment && status != db.PromotionStatusCancelled {
			if liveMode {
				exists, existsErr := qtx.PromotionInvoiceExists(ctx, id)
				if existsErr != nil {
					return existsErr
				}
				reviewExists, reviewErr := qtx.PromotionFiscalReviewExists(ctx, id)
				if reviewErr != nil {
					return reviewErr
				}
				if !exists && !reviewExists {
					return errors.New("factura promovarii nu a fost pusa in coada")
				}
			}
			return tx.Commit(ctx)
		}
		return errors.New("campania nu a putut fi activata")
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	if liveMode && h.invoicing != nil {
		h.invoicing.Wake()
	}
	return nil
}

func (h *Handler) RecordChargeRefund(ctx context.Context, charge stripe.Charge, liveMode bool) (bool, error) {
	if charge.PaymentIntent == nil || strings.TrimSpace(charge.PaymentIntent.ID) == "" {
		return false, nil
	}
	status := "partial"
	if charge.Refunded || (charge.Amount > 0 && charge.AmountRefunded >= charge.Amount) {
		status = "full"
	}
	campaignID := charge.Metadata["pulse_promotion_campaign_id"]
	if campaignID == "" && charge.PaymentIntent.Metadata != nil {
		campaignID = charge.PaymentIntent.Metadata["pulse_promotion_campaign_id"]
	}
	return h.recordRefund(ctx, charge.PaymentIntent.ID, campaignID, "", charge.ID, charge.AmountRefunded, charge.Amount, status, liveMode)
}

func (h *Handler) RecordRefund(ctx context.Context, refund stripe.Refund, liveMode bool) (bool, error) {
	if refund.PaymentIntent == nil || strings.TrimSpace(refund.PaymentIntent.ID) == "" {
		return false, nil
	}
	status := "pending"
	switch refund.Status {
	case stripe.RefundStatusSucceeded:
		status = "partial"
	case stripe.RefundStatusFailed, stripe.RefundStatusCanceled:
		status = "failed"
	}
	campaignID := refund.Metadata["pulse_promotion_campaign_id"]
	if campaignID == "" && refund.PaymentIntent.Metadata != nil {
		campaignID = refund.PaymentIntent.Metadata["pulse_promotion_campaign_id"]
	}
	chargeID := ""
	if refund.Charge != nil {
		chargeID = refund.Charge.ID
	}
	return h.recordRefund(ctx, refund.PaymentIntent.ID, campaignID, refund.ID, chargeID, refund.Amount, 0, status, liveMode)
}

func (h *Handler) recordRefund(ctx context.Context, paymentIntentID, campaignID, refundID, chargeID string, refundedAmount, chargeAmount int64, status string, liveMode bool) (bool, error) {
	if refundedAmount < 0 || chargeAmount < 0 || refundedAmount > int64(^uint32(0)>>1) || chargeAmount > int64(^uint32(0)>>1) {
		return false, errors.New("valoarea refundului promovarii este invalida")
	}
	var campaignUUID pgtype.UUID
	if campaignID != "" {
		_ = campaignUUID.Scan(campaignID)
	}
	if h.pool == nil {
		return false, errors.New("baza de date pentru promovari nu este disponibila")
	}
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	qtx := h.queries.WithTx(tx)
	if err := qtx.LockPromotionPaymentIntent(ctx, paymentIntentID); err != nil {
		return false, err
	}
	handled, err := qtx.RecordPromotionRefundState(ctx, db.RecordPromotionRefundStateParams{
		StripeLivemode: liveMode, PaymentIntentID: paymentIntentID, CampaignID: campaignUUID,
		StripeRefundID: refundID, StripeChargeID: chargeID,
		RefundedAmountBani: int32(refundedAmount), ChargeAmountBani: int32(chargeAmount), RefundStatus: status,
	})
	if err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return handled, nil
}

func numeric(value float64) pgtype.Numeric {
	var result pgtype.Numeric
	_ = result.Scan(strconv.FormatFloat(value, 'f', 2, 64))
	return result
}

func (h *Handler) CancelCampaign(ctx context.Context, campaignID, sessionID string) error {
	var id pgtype.UUID
	if id.Scan(campaignID) != nil || !id.Valid || strings.TrimSpace(sessionID) == "" {
		return nil
	}
	return h.queries.CancelPendingPromotionCampaignForCheckout(ctx, db.CancelPendingPromotionCampaignForCheckoutParams{
		ID:                      id,
		StripeCheckoutSessionID: sessionID,
	})
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
			ID:                  common.UUIDToString(row.ID),
			EventID:             common.UUIDToString(row.EventID),
			EventTitle:          row.EventTitle,
			Plan:                string(row.Plan),
			Placement:           string(row.Placement),
			Status:              string(row.Status),
			StartsAt:            row.StartsAt.Time,
			EndsAt:              row.EndsAt.Time,
			AmountRon:           row.AmountBani / 100,
			ImpressionsCount:    row.ImpressionsCount,
			ClicksCount:         row.ClicksCount,
			CreatedAt:           row.CreatedAt.Time,
			InvoiceStatus:       row.InvoiceStatus.String,
			InvoiceSeries:       row.InvoiceSeries.String,
			InvoiceNumber:       row.InvoiceNumber.String,
			InvoiceDocumentURL:  row.InvoiceDocumentUrl.String,
			InvoiceRefundStatus: row.InvoiceRefundStatus.String,
			InvoiceRefundedRon:  float64(row.InvoiceRefundedAmountBani) / 100,
			AttentionRequired:   row.AttentionRequired,
			AttentionReason:     row.AttentionReason,
		}
		if row.InvoiceIssuedAt.Valid {
			issuedAt := row.InvoiceIssuedAt.Time
			item.InvoiceIssuedAt = &issuedAt
		}
		if item.ImpressionsCount > 0 {
			item.CTR = float64(item.ClicksCount) / float64(item.ImpressionsCount) * 100
		}
		items = append(items, item)
	}
	router.RespondWithJSON(w, http.StatusOK, items)
}

func (h *Handler) HandleAdminInvoiceAttention(w http.ResponseWriter, r *http.Request) {
	rows, err := h.queries.ListAdminPromotionInvoiceAttention(r.Context())
	if err != nil {
		log.Printf("list promotion invoice attention failed: %v", err)
		router.RespondWithError(w, http.StatusInternalServerError, "Facturile de promovare care necesita atentie nu au putut fi incarcate")
		return
	}
	items := make([]InvoiceAttentionResponse, 0, len(rows))
	for _, row := range rows {
		items = append(items, InvoiceAttentionResponse{
			ID: common.UUIDToString(row.AttentionID), CampaignID: common.UUIDToString(row.CampaignID),
			EventTitle: row.EventTitle, OrganizerID: common.UUIDToString(row.OrganizerID), CustomerEmail: row.CustomerEmail,
			AmountRon: float64(row.AmountBani) / 100, PaymentIntentID: row.PaymentIntentID,
			InvoiceStatus: row.InvoiceStatus, RefundStatus: row.RefundStatus,
			RefundedAmountRon: float64(row.RefundedAmountBani) / 100, Reason: row.Reason,
			CreatedAt: common.TimestampToString(row.CreatedAt), UpdatedAt: common.TimestampToString(row.UpdatedAt),
		})
	}
	router.RespondWithJSON(w, http.StatusOK, items)
}

func (h *Handler) HandleListActive(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
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
			items = append(items, PromotedEventResponse{CampaignID: common.UUIDToString(promotion.CampaignID), Placement: string(promotion.Placement), Event: eventapi.MapFromDBGetEvent(row)})
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
	if !router.DecodeJSON(w, r, &body, maxPromotionJSONBytes) {
		return
	}
	if (body.Metric != "impression" && body.Metric != "click") || len(body.ViewerKey) < 8 || len(body.ViewerKey) > 100 {
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
