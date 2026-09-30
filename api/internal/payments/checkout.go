package payments

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/mail"
	"sort"
	"strings"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/abuse"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/email"
	"pulse-api/internal/invoicing"
	"pulse-api/internal/organizer"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stripe/stripe-go/v85"
)

const (
	platformFeePercent            = int64(4)
	platformFeePerTicketBani      = int64(250)
	checkoutExpiration            = 30 * time.Minute
	maxCheckoutJSONBytes          = 32 << 10
	maxActiveCheckoutOrders       = 3
	maxActiveReservedTickets      = 16
	maxActiveCheckoutOrdersPerIP  = 5
	maxActiveReservedTicketsPerIP = 32
)

var errStripeRefundBindingMismatch = errors.New("refundul Stripe nu corespunde platii originale")
var errTooManyActiveCheckoutReservations = errors.New("too many active checkout reservations")

type CheckoutHandler struct {
	queries                 *db.Queries
	db                      *pgxpool.Pool
	client                  *stripe.Client
	appURL                  string
	mailer                  *email.Mailer
	invoicing               *invoicing.Service
	configured              bool
	expectedLiveMode        bool
	expectedLiveModeKnown   bool
	retrieveSession         func(context.Context, string, string) (*stripe.CheckoutSession, error)
	afterPendingRefundBound func()
	abuse                   *abuse.Protection
}

type CheckoutItemRequest struct {
	TicketTypeID string `json:"ticketTypeId"`
	Quantity     int32  `json:"quantity"`
}

type CreateCheckoutRequest struct {
	Email          string                `json:"email"`
	Items          []CheckoutItemRequest `json:"items"`
	PromoCode      string                `json:"promoCode"`
	BillingDetails BillingDetailsRequest `json:"billingDetails"`
}

type BillingDetailsRequest struct {
	Type               string `json:"type"`
	Name               string `json:"name"`
	TaxID              string `json:"taxId"`
	RegistrationNumber string `json:"registrationNumber"`
	Address            string `json:"address"`
	City               string `json:"city"`
	County             string `json:"county"`
	Sector             string `json:"sector"`
	Country            string `json:"country"`
}

type CreateCheckoutResponse struct {
	CheckoutURL string `json:"checkoutUrl"`
	OrderID     string `json:"orderId"`
}

type ReconcileCheckoutRequest struct {
	SessionID string `json:"sessionId"`
	EventID   string `json:"eventId"`
}

type ReconcileCheckoutResponse struct {
	Status  string `json:"status"`
	OrderID string `json:"orderId"`
}

type checkoutItem struct {
	ticketType db.TicketTypes
	quantity   int32
	unitPrice  int32
}

func NewCheckoutHandler(queries *db.Queries, pool *pgxpool.Pool, stripeSecret, appURL string, mailer *email.Mailer, invoicingService *invoicing.Service, abuseProtection *abuse.Protection) *CheckoutHandler {
	if appURL == "" {
		appURL = "http://localhost:3000"
	}

	expectedLiveMode, expectedLiveModeKnown := stripeSecretLiveMode(stripeSecret)
	return &CheckoutHandler{
		queries:               queries,
		db:                    pool,
		client:                stripe.NewClient(stripeSecret),
		appURL:                strings.TrimRight(appURL, "/"),
		mailer:                mailer,
		invoicing:             invoicingService,
		configured:            stripeSecret != "",
		expectedLiveMode:      expectedLiveMode,
		expectedLiveModeKnown: expectedLiveModeKnown,
		abuse:                 abuseProtection,
	}
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

func (h *CheckoutHandler) acceptsStripeLiveMode(liveMode bool) bool {
	return h == nil || !h.expectedLiveModeKnown || h.expectedLiveMode == liveMode
}

type checkoutRequestError struct {
	status  int
	message string
}

func (e *checkoutRequestError) Error() string {
	return e.message
}

func (h *CheckoutHandler) HandleCreateCheckout(w http.ResponseWriter, r *http.Request) {
	if !h.configured {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Platile nu sunt configurate")
		return
	}

	var req CreateCheckoutRequest
	if !router.DecodeJSON(w, r, &req, maxCheckoutJSONBytes) {
		return
	}

	req.Email = strings.TrimSpace(req.Email)
	if len(req.Email) == 0 || len(req.Email) > 255 {
		router.RespondWithError(w, http.StatusBadRequest, "Adresa de email este invalida")
		return
	}
	if address, err := mail.ParseAddress(req.Email); err != nil || address.Address != req.Email {
		router.RespondWithError(w, http.StatusBadRequest, "Adresa de email este invalida")
		return
	}
	if len(req.Items) == 0 {
		router.RespondWithError(w, http.StatusBadRequest, "Selecteaza cel putin un bilet")
		return
	}
	billingDetails, err := normalizeBillingDetails(req.BillingDetails)
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	var eventID pgtype.UUID
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}

	userID := optionalUserID(r.Context())
	checkoutSubject := "guest:" + strings.ToLower(req.Email)
	if userID.Valid {
		checkoutSubject = "user:" + common.UUIDToString(userID)
	}
	if h.abuse != nil && !h.abuse.Enforce(r.Context(), w, "checkout_identity_event", checkoutSubject+":"+common.UUIDToString(eventID), 5, 10*time.Minute) {
		return
	}
	var reservationIPHash []byte
	if h.abuse != nil {
		reservationIPHash = h.abuse.SubjectDigest("checkout_reservation_ip", h.abuse.ClientIP(r))
	}
	items, totalTicketCount, ok := parseCheckoutItems(w, req.Items)
	if !ok {
		return
	}

	order, checkoutItems, eventTitle, eventIDString, organizerStripeAccount, organizerAbsorbsServiceFee, err := h.reserveOrder(r.Context(), eventID, userID, req.Email, reservationIPHash, items, totalTicketCount, req.PromoCode, billingDetails)
	if err != nil {
		var requestError *checkoutRequestError
		if errors.As(err, &requestError) {
			if requestError.status == http.StatusTooManyRequests {
				w.Header().Set("Retry-After", "300")
			}
			router.RespondWithError(w, requestError.status, requestError.message)
			return
		}
		router.RespondWithError(w, http.StatusInternalServerError, "Comanda nu a putut fi pregatita")
		return
	}

	params := &stripe.CheckoutSessionCreateParams{
		Mode:               stripe.String("payment"),
		SuccessURL:         stripe.String(fmt.Sprintf("%s/checkout/success?event_id=%s&session_id={CHECKOUT_SESSION_ID}", h.appURL, eventIDString)),
		CancelURL:          stripe.String(fmt.Sprintf("%s/events/%s?checkout=cancelled", h.appURL, eventIDString)),
		CustomerEmail:      stripe.String(req.Email),
		ClientReferenceID:  stripe.String(common.UUIDToString(order.ID)),
		ExpiresAt:          stripe.Int64(time.Now().Add(checkoutExpiration).Unix()),
		PaymentMethodTypes: []*string{stripe.String("card")},
		Metadata: map[string]string{
			"spottr_order_id": common.UUIDToString(order.ID),
			"spottr_event_id": eventIDString,
		},
		PaymentIntentData: &stripe.CheckoutSessionCreatePaymentIntentDataParams{
			ApplicationFeeAmount: stripe.Int64(int64(order.PlatformFeeBani)),
			ReceiptEmail:         stripe.String(req.Email),
			Metadata: map[string]string{
				"spottr_order_id": common.UUIDToString(order.ID),
				"spottr_event_id": eventIDString,
			},
		},
	}
	params.SetIdempotencyKey("pulse-checkout-" + common.UUIDToString(order.ID))
	params.SetStripeAccount(organizerStripeAccount)

	for _, item := range checkoutItems {
		params.LineItems = append(params.LineItems, &stripe.CheckoutSessionCreateLineItemParams{
			Quantity: stripe.Int64(int64(item.quantity)),
			PriceData: &stripe.CheckoutSessionCreateLineItemPriceDataParams{
				Currency:   stripe.String("ron"),
				UnitAmount: stripe.Int64(int64(item.unitPrice) * 100),
				ProductData: &stripe.CheckoutSessionCreateLineItemPriceDataProductDataParams{
					Name: stripe.String(fmt.Sprintf("%s - %s", eventTitle, item.ticketType.Name)),
				},
			},
		})
	}
	if !organizerAbsorbsServiceFee {
		params.LineItems = append(params.LineItems, &stripe.CheckoutSessionCreateLineItemParams{
			Quantity: stripe.Int64(1),
			PriceData: &stripe.CheckoutSessionCreateLineItemPriceDataParams{
				Currency:   stripe.String("ron"),
				UnitAmount: stripe.Int64(int64(order.CustomerTicketingFeeBani)),
				ProductData: &stripe.CheckoutSessionCreateLineItemPriceDataProductDataParams{
					Name: stripe.String("Taxă de ticketing și procesare"),
				},
			},
		})
	}

	taxRateID, err := h.eventTaxRate(r.Context(), organizerStripeAccount, order.TicketVatPercentage)
	if err != nil {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		cleanupErr := h.failOrder(cleanupCtx, order.ID, "", organizerStripeAccount)
		cancel()
		log.Printf("checkout VAT setup failed: order=%s err=%v cleanup=%v", common.UUIDToString(order.ID), err, cleanupErr)
		router.RespondWithError(w, http.StatusBadGateway, "Configurarea TVA pentru plata nu a putut fi finalizata. Incearca din nou.")
		return
	}
	applyInclusiveEventVAT(params, order.TicketVatPercentage, taxRateID)
	session, err := h.client.V1CheckoutSessions.Create(r.Context(), params)
	createOutcomeUnknown := err != nil && !isDefinitiveStripeCreateFailure(err)
	if createOutcomeUnknown {
		// Stripe idempotency makes this retry return the original Session when the
		// first response was lost after Stripe committed it.
		retryCtx, retryCancel := context.WithTimeout(context.Background(), 10*time.Second)
		session, err = h.client.V1CheckoutSessions.Create(retryCtx, params)
		retryCancel()
	}
	if err != nil {
		if createOutcomeUnknown {
			h.markCheckoutReservationForReview(order.ID, "stripe_create_outcome_unknown")
		} else if failErr := h.failOrder(r.Context(), order.ID, "", organizerStripeAccount); failErr != nil {
			log.Printf("definitive Stripe checkout failure reservation cleanup failed: order=%s", common.UUIDToString(order.ID))
		}
		if !createOutcomeUnknown && isStripeAccountMissing(err) {
			if _, clearErr := h.queries.ClearOrganizerStripeAccount(r.Context(), pgtype.Text{String: organizerStripeAccount, Valid: true}); clearErr != nil && !errors.Is(clearErr, pgx.ErrNoRows) {
				log.Print("Stripe account cleanup failed after checkout destination disappeared")
			}
			router.RespondWithError(w, http.StatusConflict, "Organizatorul trebuie sa reconecteze contul Stripe inainte de a putea accepta plati")
			return
		}
		router.RespondWithError(w, http.StatusBadGateway, "Sesiunea de plata Stripe nu a putut fi creata")
		return
	}
	if session == nil || strings.TrimSpace(session.ID) == "" || strings.TrimSpace(session.URL) == "" {
		h.markCheckoutReservationForReview(order.ID, "stripe_create_outcome_unknown")
		router.RespondWithError(w, http.StatusBadGateway, "Sesiunea de plata Stripe nu a putut fi confirmata")
		return
	}

	updateSession := func(ctx context.Context) error {
		return h.queries.UpdateOrderCheckoutSession(ctx, db.UpdateOrderCheckoutSessionParams{
			ID:                      order.ID,
			StripeCheckoutSessionID: pgtype.Text{String: session.ID, Valid: true},
			StripeLivemode:          session.Livemode,
			StripePaymentIntentID:   pgtype.Text{String: stripePaymentIntentID(session.PaymentIntent), Valid: session.PaymentIntent != nil && session.PaymentIntent.ID != ""},
		})
	}
	updateErr := updateSession(r.Context())
	if updateErr != nil {
		// Retry once before invalidating the external session. Never release local
		// inventory while a payable Stripe Checkout Session may still exist.
		retryCtx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		updateErr = updateSession(retryCtx)
		cancel()
	}
	if updateErr != nil {
		expireParams := &stripe.CheckoutSessionExpireParams{}
		expireParams.SetStripeAccount(organizerStripeAccount)
		expireCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		expiredSession, expireErr := h.client.V1CheckoutSessions.Expire(expireCtx, session.ID, expireParams)
		cancel()
		if checkoutSessionConfirmedExpired(expiredSession, expireErr) {
			cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
			failErr := h.failOrder(cleanupCtx, order.ID, "", organizerStripeAccount)
			cleanupCancel()
			if failErr != nil {
				log.Printf("checkout session expired but reservation cleanup failed: order=%s", common.UUIDToString(order.ID))
			}
		} else {
			log.Printf("checkout session persistence and safe expiration failed: order=%s", common.UUIDToString(order.ID))
			h.markCheckoutReservationForReview(order.ID, "stripe_session_outcome_unknown")
		}
		router.RespondWithError(w, http.StatusInternalServerError, "Sesiunea de plata nu a putut fi salvata")
		return
	}

	router.RespondWithJSON(w, http.StatusCreated, CreateCheckoutResponse{
		CheckoutURL: session.URL,
		OrderID:     common.UUIDToString(order.ID),
	})
}

func isDefinitiveStripeCreateFailure(err error) bool {
	var stripeErr *stripe.Error
	if !errors.As(err, &stripeErr) {
		return false
	}
	status := stripeErr.HTTPStatusCode
	return status >= http.StatusBadRequest && status < http.StatusInternalServerError &&
		status != http.StatusRequestTimeout && status != http.StatusConflict && status != http.StatusTooManyRequests
}

func checkoutSessionConfirmedExpired(session *stripe.CheckoutSession, err error) bool {
	return err == nil && session != nil && session.Status == stripe.CheckoutSessionStatusExpired
}

func (h *CheckoutHandler) markCheckoutReservationForReview(orderID pgtype.UUID, reason string) {
	reviewCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := h.queries.MarkCheckoutReservationForReview(reviewCtx, db.MarkCheckoutReservationForReviewParams{
		OrderID: orderID,
		Reason:  reason,
	}); err != nil {
		log.Printf("checkout reservation review marker failed: order=%s", common.UUIDToString(orderID))
	}
}

// HandleReconcileCheckout is an idempotent fallback for delayed or missed
// Connect webhooks. Stripe remains the source of truth for payment status.
func (h *CheckoutHandler) HandleReconcileCheckout(w http.ResponseWriter, r *http.Request) {
	if !h.configured {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Platile nu sunt configurate")
		return
	}

	var req ReconcileCheckoutRequest
	if !router.DecodeJSON(w, r, &req, maxCheckoutJSONBytes) {
		return
	}
	req.SessionID = strings.TrimSpace(req.SessionID)
	req.EventID = strings.TrimSpace(req.EventID)
	if req.SessionID == "" || req.EventID == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Sesiunea de plata este invalida")
		return
	}
	if len(req.SessionID) > 255 || len(req.EventID) > 64 {
		router.RespondWithError(w, http.StatusBadRequest, "Sesiunea de plata este invalida")
		return
	}
	if h.abuse != nil && !h.abuse.Enforce(r.Context(), w, "checkout_reconcile_session", req.SessionID, 10, 10*time.Minute) {
		return
	}

	status, orderID, err := h.reconcileCheckoutSession(r.Context(), req.SessionID, req.EventID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			router.RespondWithError(w, http.StatusNotFound, "Sesiunea de plata nu a fost gasita")
			return
		}
		log.Printf("checkout success reconciliation failed: event=%s", req.EventID)
		router.RespondWithError(w, http.StatusBadGateway, "Confirmarea platii este temporar indisponibila")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, ReconcileCheckoutResponse{Status: status, OrderID: orderID})
}

func (h *CheckoutHandler) HandleValidatePromoCode(w http.ResponseWriter, r *http.Request) {
	var eventID pgtype.UUID
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "Eveniment invalid")
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if !router.DecodeJSON(w, r, &req, maxCheckoutJSONBytes) {
		return
	}

	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if code == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Codul promo este obligatoriu")
		return
	}
	if len(code) > 64 {
		router.RespondWithError(w, http.StatusBadRequest, "Codul promo este invalid, expirat sau epuizat")
		return
	}

	promo, err := h.queries.GetAvailablePromoCode(r.Context(), db.GetAvailablePromoCodeParams{
		EventID: eventID,
		Code:    code,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusNotFound, "Codul promo este invalid, expirat sau epuizat")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Codul promo nu a putut fi verificat")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, map[string]any{
		"code":            promo.Code,
		"discountPercent": promo.DiscountPercent,
	})
}

func (h *CheckoutHandler) reserveOrder(ctx context.Context, eventID, userID pgtype.UUID, email string, reservationIPHash []byte, requested map[string]int32, totalTicketCount int32, rawPromoCode string, billing BillingDetailsRequest) (db.Orders, []checkoutItem, string, string, string, bool, error) {
	tx, err := h.db.Begin(ctx)
	if err != nil {
		return db.Orders{}, nil, "", "", "", false, err
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)
	if _, err := qtx.LockPublishedEventForCheckout(ctx, eventID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Orders{}, nil, "", "", "", false, &checkoutRequestError{status: http.StatusConflict, message: "Vanzarea biletelor pentru acest eveniment este oprita"}
		}
		return db.Orders{}, nil, "", "", "", false, err
	}
	event, err := qtx.GetEventWithStats(ctx, eventID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Orders{}, nil, "", "", "", false, &checkoutRequestError{status: http.StatusNotFound, message: "Evenimentul nu a fost gasit"}
		}
		return db.Orders{}, nil, "", "", "", false, err
	}
	if userID.Valid && event.OrganizerID == userID {
		return db.Orders{}, nil, "", "", "", false, &checkoutRequestError{status: http.StatusForbidden, message: "Nu poti cumpara bilete la propriul eveniment"}
	}
	if event.Status != "published" {
		return db.Orders{}, nil, "", "", "", false, &checkoutRequestError{status: http.StatusConflict, message: "Vanzarea biletelor pentru acest eveniment este oprita"}
	}
	vat, vatErr := event.VatPercentage.Float64Value()
	if vatErr != nil || !vat.Valid || !common.SupportedEventVATRate(vat.Float64) {
		return db.Orders{}, nil, "", "", "", false, &checkoutRequestError{status: http.StatusConflict, message: "Organizatorul trebuie sa configureze TVA-ul evenimentului inainte de vanzarea biletelor"}
	}

	profile, err := qtx.GetOrganizerProfile(ctx, event.OrganizerID)
	if err != nil || !organizer.CanSellTickets(profile) || !profile.StripeAccountID.Valid {
		return db.Orders{}, nil, "", "", "", false, &checkoutRequestError{status: http.StatusConflict, message: "Organizatorul nu poate accepta plati pentru acest eveniment"}
	}

	if err := enforceActiveCheckoutReservationCap(ctx, tx, eventID, userID, email, reservationIPHash, totalTicketCount); err != nil {
		if !errors.Is(err, errTooManyActiveCheckoutReservations) {
			return db.Orders{}, nil, "", "", "", false, err
		}
		return db.Orders{}, nil, "", "", "", false, &checkoutRequestError{
			status:  http.StatusTooManyRequests,
			message: "Ai deja prea multe rezervari de plata active pentru acest eveniment",
		}
	}

	keys := make([]string, 0, len(requested))
	for id := range requested {
		keys = append(keys, id)
	}
	sort.Strings(keys)

	items := make([]checkoutItem, 0, len(keys))
	var originalAmount int64
	now := time.Now()
	for _, id := range keys {
		var ticketTypeID pgtype.UUID
		if err := ticketTypeID.Scan(id); err != nil || !ticketTypeID.Valid {
			return db.Orders{}, nil, "", "", "", false, &checkoutRequestError{status: http.StatusBadRequest, message: "ID-ul tipului de bilet este invalid"}
		}

		ticketType, err := qtx.GetTicketTypeForUpdate(ctx, ticketTypeID)
		if err != nil || ticketType.EventID != eventID {
			return db.Orders{}, nil, "", "", "", false, &checkoutRequestError{status: http.StatusNotFound, message: "Tipul de bilet nu apartine evenimentului"}
		}
		quantity := requested[id]
		if ticketType.TicketsSold+quantity > ticketType.Capacity {
			return db.Orders{}, nil, "", "", "", false, &checkoutRequestError{status: http.StatusConflict, message: "Nu mai exista suficiente bilete disponibile"}
		}
		if now.Before(ticketType.StartSales.Time) || now.After(ticketType.EndSales.Time) {
			return db.Orders{}, nil, "", "", "", false, &checkoutRequestError{status: http.StatusBadRequest, message: "Vanzarile pentru acest tip de bilet sunt inchise"}
		}

		originalAmount += int64(ticketType.PriceRon) * int64(quantity)
		items = append(items, checkoutItem{ticketType: ticketType, quantity: quantity, unitPrice: ticketType.PriceRon})
	}

	promoCode := strings.ToUpper(strings.TrimSpace(rawPromoCode))
	var promoCodeID pgtype.UUID
	var discountPercent int32
	if promoCode != "" {
		promo, err := qtx.GetAvailablePromoCodeForUpdate(ctx, db.GetAvailablePromoCodeForUpdateParams{
			EventID: eventID,
			Code:    promoCode,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Orders{}, nil, "", "", "", false, &checkoutRequestError{status: http.StatusBadRequest, message: "Codul promo este invalid, expirat sau epuizat"}
		}
		if err != nil {
			return db.Orders{}, nil, "", "", "", false, err
		}
		promoCodeID = promo.ID
		discountPercent = promo.DiscountPercent
	}

	var totalAmount int64
	for index := range items {
		if discountPercent > 0 {
			items[index].unitPrice = max(1, (items[index].ticketType.PriceRon*(100-discountPercent)+50)/100)
		}
		totalAmount += int64(items[index].unitPrice) * int64(items[index].quantity)
	}

	if totalAmount <= 0 || totalAmount > int64(^uint32(0)>>1) {
		return db.Orders{}, nil, "", "", "", false, &checkoutRequestError{status: http.StatusBadRequest, message: "Valoarea totala a comenzii este invalida"}
	}

	platformFeeBani := calculatePlatformFeeBani(totalAmount*100, totalTicketCount)
	if event.OrganizerAbsorbsServiceFee && platformFeeBani >= totalAmount*100 {
		return db.Orders{}, nil, "", "", "", false, &checkoutRequestError{status: http.StatusBadRequest, message: "Valoarea biletelor trebuie sa depaseasca comisionul platformei"}
	}
	customerTicketingFeeBani := int64(0)
	if !event.OrganizerAbsorbsServiceFee {
		customerTicketingFeeBani = platformFeeBani
	}

	for _, item := range items {
		if err := qtx.IncrementTicketsSold(ctx, db.IncrementTicketsSoldParams{
			ID:          item.ticketType.ID,
			TicketsSold: item.quantity,
		}); err != nil {
			return db.Orders{}, nil, "", "", "", false, err
		}
	}

	order, err := qtx.CreateCheckoutOrder(ctx, db.CreateCheckoutOrderParams{
		UserID:                    userID,
		EventID:                   eventID,
		Email:                     email,
		TotalAmount:               int32(totalAmount),
		PlatformFeeBani:           int32(platformFeeBani),
		CustomerTicketingFeeBani:  int32(customerTicketingFeeBani),
		Status:                    db.OrderStatusPending,
		PromoCodeID:               promoCodeID,
		DiscountAmountRon:         int32(originalAmount - totalAmount),
		InvoiceRequested:          true,
		BillingType:               billing.Type,
		BillingName:               billing.Name,
		BillingTaxID:              billing.TaxID,
		BillingRegistrationNumber: billing.RegistrationNumber,
		BillingAddress:            billing.Address,
		BillingCity:               billing.City,
		BillingCounty:             billing.County,
		BillingSector:             billing.Sector,
		BillingCountry:            billing.Country,
		StripeConnectedAccountID:  pgtype.Text{String: profile.StripeAccountID.String, Valid: true},
		StripeChargeType:          pgtype.Text{String: directChargeType, Valid: true},
		ReservationIpHash:         reservationIPHash,
	})
	if err != nil {
		return db.Orders{}, nil, "", "", "", false, err
	}

	for _, item := range items {
		if err := qtx.CreateOrderItem(ctx, db.CreateOrderItemParams{
			OrderID:      order.ID,
			TicketTypeID: item.ticketType.ID,
			Quantity:     item.quantity,
			UnitPriceRon: item.unitPrice,
		}); err != nil {
			return db.Orders{}, nil, "", "", "", false, err
		}
	}
	if promoCodeID.Valid {
		if err := qtx.IncrementPromoCodeRedemption(ctx, promoCodeID); err != nil {
			return db.Orders{}, nil, "", "", "", false, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return db.Orders{}, nil, "", "", "", false, err
	}

	return order, items, event.Title, common.UUIDToString(eventID), profile.StripeAccountID.String, event.OrganizerAbsorbsServiceFee, nil
}

func enforceActiveCheckoutReservationCap(ctx context.Context, tx pgx.Tx, eventID, userID pgtype.UUID, email string, reservationIPHash []byte, requestedTickets int32) error {
	reservationIdentity := "guest:" + strings.ToLower(strings.TrimSpace(email))
	if userID.Valid {
		reservationIdentity = "user:" + common.UUIDToString(userID)
	}
	eventKey := common.UUIDToString(eventID)
	lockKeys := []string{"checkout-reservation:" + eventKey + ":" + reservationIdentity}
	if len(reservationIPHash) > 0 {
		lockKeys = append(lockKeys, "checkout-reservation-ip:"+eventKey+":"+hex.EncodeToString(reservationIPHash))
	}
	// Every transaction takes the same deterministic lock order so requests
	// sharing either identity or IP cannot deadlock while being serialized.
	sort.Strings(lockKeys)
	for _, lockKey := range lockKeys {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, lockKey); err != nil {
			return err
		}
	}

	var activeOrders, activeTickets int64
	var err error
	if userID.Valid {
		err = tx.QueryRow(ctx, `
SELECT COUNT(DISTINCT o.id), COALESCE(SUM(oi.quantity), 0)
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.event_id = $1
  AND o.status = 'pending'
  AND o.user_id = $2`,
			eventID, userID).Scan(&activeOrders, &activeTickets)
	} else {
		err = tx.QueryRow(ctx, `
SELECT COUNT(DISTINCT o.id), COALESCE(SUM(oi.quantity), 0)
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.event_id = $1
  AND o.status = 'pending'
  AND o.user_id IS NULL
  AND lower(o.email) = lower($2)`,
			eventID, email).Scan(&activeOrders, &activeTickets)
	}
	if err != nil {
		return err
	}
	if activeOrders >= maxActiveCheckoutOrders || activeTickets+int64(requestedTickets) > maxActiveReservedTickets {
		return errTooManyActiveCheckoutReservations
	}
	if len(reservationIPHash) > 0 {
		if err := tx.QueryRow(ctx, `
SELECT COUNT(DISTINCT o.id), COALESCE(SUM(oi.quantity), 0)
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.event_id = $1
  AND o.status = 'pending'
  AND o.reservation_ip_hash = $2`,
			eventID, reservationIPHash).Scan(&activeOrders, &activeTickets); err != nil {
			return err
		}
		if activeOrders >= maxActiveCheckoutOrdersPerIP || activeTickets+int64(requestedTickets) > maxActiveReservedTicketsPerIP {
			return errTooManyActiveCheckoutReservations
		}
	}
	return nil
}

func (h *CheckoutHandler) FulfillCheckout(ctx context.Context, sessionID, paymentIntentID, orderID, connectedAccountID string, liveMode bool) error {
	if strings.TrimSpace(sessionID) == "" || strings.TrimSpace(paymentIntentID) == "" {
		return nil
	}
	var parsedOrderID pgtype.UUID
	if err := parsedOrderID.Scan(orderID); err != nil || !parsedOrderID.Valid {
		return nil
	}

	tx, err := h.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)
	order, err := qtx.GetOrderForUpdate(ctx, parsedOrderID)
	if err != nil {
		return err
	}
	if !stripeOrderContextMatches(order, connectedAccountID) {
		return errors.New("contextul contului Stripe nu corespunde comenzii")
	}
	if order.StripeLivemode.Valid && order.StripeLivemode.Bool != liveMode {
		return errors.New("mediul Stripe din webhook nu corespunde comenzii")
	}
	// Never fulfill from metadata alone. A connected-account operator can create
	// their own Stripe objects and choose metadata, while only the exact Session
	// ID persisted by SPOTTR proves this is the checkout we created with the
	// expected application fee. Sessionless orders remain quarantined until an
	// operator verifies and binds the external outcome.
	if !order.StripeCheckoutSessionID.Valid || order.StripeCheckoutSessionID.String == "" {
		if err := qtx.MarkCheckoutReservationForReview(ctx, db.MarkCheckoutReservationForReviewParams{
			OrderID: order.ID,
			Reason:  "unbound_completed_session",
		}); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	if order.StripeCheckoutSessionID.String != sessionID {
		return tx.Commit(ctx)
	}
	// Once a PaymentIntent has been bound to the order it is immutable. This
	// prevents a valid Session ID plus attacker-controlled metadata from replacing
	// the payment identity stored during Checkout creation or reconciliation.
	if order.StripePaymentIntentID.Valid && order.StripePaymentIntentID.String != "" && order.StripePaymentIntentID.String != paymentIntentID {
		return tx.Commit(ctx)
	}
	if order.Status == db.OrderStatusPending || order.Status == db.OrderStatusFailed {
		// Checkout creation commonly returns before Stripe attaches its
		// PaymentIntent. Persist the ID from the exact paid Session before any
		// refund-review branch so the refund worker can address the real payment.
		if err := qtx.UpdateOrderStatus(ctx, db.UpdateOrderStatusParams{
			ID:                    order.ID,
			Status:                order.Status,
			StripePaymentIntentID: pgtype.Text{String: paymentIntentID, Valid: true},
		}); err != nil {
			return err
		}
	}
	if err := qtx.SetOrderStripeLivemode(ctx, db.SetOrderStripeLivemodeParams{
		ID:             order.ID,
		StripeLivemode: liveMode,
	}); err != nil {
		return err
	}
	if (order.Status == db.OrderStatusPending || order.Status == db.OrderStatusFailed) && order.StripeRefundNeedsAttention {
		log.Printf("SECURITY checkout fulfillment held for refund review: order=%s payment_intent=%s", common.UUIDToString(order.ID), paymentIntentID)
		return tx.Commit(ctx)
	}
	if order.Status == db.OrderStatusCompleted {
		if err := tx.Commit(ctx); err != nil {
			return err
		}
		h.queueInvoice(ctx, order.ID)
		if err := h.deliverTicketConfirmation(order.ID); err != nil {
			// Payment fulfillment is already committed. Email delivery is retried by
			// the reconciliation worker and must not make Stripe retry the payment event.
			log.Printf("ticket confirmation remains queued for order %s: %v", common.UUIDToString(order.ID), err)
		}
		return nil
	}
	if order.Status != db.OrderStatusPending && order.Status != db.OrderStatusFailed {
		return tx.Commit(ctx)
	}
	eventStatus, err := qtx.GetEventStatusForCheckoutUpdate(ctx, order.EventID)
	if err != nil {
		return err
	}
	if eventStatus != "published" {
		// The payment is real, but the event entered cancellation/completion (or
		// otherwise stopped selling) before fulfillment acquired its lock. Do not
		// issue a ticket outside the cancellation refund snapshot.
		return markPaidCheckoutForRefundReviewLocked(ctx, qtx, tx, order.ID, "paid_after_event_closed")
	}

	items, err := qtx.GetOrderItems(ctx, order.ID)
	if err != nil {
		return err
	}
	// Older releases treated a failed PaymentIntent attempt as terminal and
	// released inventory. Stripe Checkout can retry that same Session and later
	// complete successfully. Restore the reservation atomically, without ever
	// exceeding ticket or promotion capacity, before issuing tickets.
	if order.Status == db.OrderStatusFailed {
		restoreTx, err := tx.Begin(ctx)
		if err != nil {
			return err
		}
		restoreQueries := h.queries.WithTx(restoreTx)
		markForRefundReview := func() error {
			if err := restoreTx.Rollback(ctx); err != nil && !errors.Is(err, pgx.ErrTxClosed) {
				return err
			}
			// The parent transaction still owns the order row lock. Marking review
			// before releasing that lock closes the race with a second completion or
			// refund webhook.
			return markPaidCheckoutForRefundReviewLocked(ctx, qtx, tx, order.ID, "paid_after_inventory_release")
		}
		for _, item := range items {
			restored, err := restoreQueries.RestoreReleasedTicketReservation(ctx, db.RestoreReleasedTicketReservationParams{
				ID:          item.TicketTypeID,
				TicketsSold: item.Quantity,
			})
			if err != nil {
				return err
			}
			if restored != 1 {
				return markForRefundReview()
			}
		}
		if order.PromoCodeID.Valid {
			restored, err := restoreQueries.RestoreReleasedPromoCodeRedemption(ctx, order.PromoCodeID)
			if err != nil {
				return err
			}
			if restored != 1 {
				return markForRefundReview()
			}
		}
		if err := restoreTx.Commit(ctx); err != nil {
			return err
		}
	}
	for _, item := range items {
		for range item.Quantity {
			validationHash, err := generateValidationHash()
			if err != nil {
				return err
			}
			if _, err := qtx.CreateTicket(ctx, db.CreateTicketParams{
				OrderID:        order.ID,
				TicketTypeID:   item.TicketTypeID,
				UserID:         order.UserID,
				ValidationHash: validationHash,
			}); err != nil {
				return err
			}
		}
	}

	if err := qtx.UpdateOrderStatus(ctx, db.UpdateOrderStatusParams{
		ID:                    order.ID,
		Status:                db.OrderStatusCompleted,
		StripePaymentIntentID: pgtype.Text{String: paymentIntentID, Valid: paymentIntentID != ""},
	}); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	if err := h.queries.CreateTicketPurchaseNotification(ctx, order.ID); err != nil {
		log.Printf("ticket purchase notification failed for order %s: %v", common.UUIDToString(order.ID), err)
	}
	h.queueInvoice(ctx, order.ID)
	if err := h.deliverTicketConfirmation(order.ID); err != nil {
		// The ticket exists at this point; keep webhook acknowledgement independent
		// from the transactional email provider.
		log.Printf("ticket confirmation remains queued for order %s: %v", common.UUIDToString(order.ID), err)
	}
	return nil
}

func (h *CheckoutHandler) queueInvoice(ctx context.Context, orderID pgtype.UUID) {
	if h.invoicing == nil {
		return
	}
	if err := h.invoicing.QueueOrder(ctx, orderID); err != nil {
		log.Printf("invoice could not be queued for order %s: %v", common.UUIDToString(orderID), err)
	}
}

func (h *CheckoutHandler) deliverTicketConfirmation(orderID pgtype.UUID) error {
	if h.mailer == nil {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	rows, err := h.queries.ListOrderTicketEmailDetails(ctx, orderID)
	if err != nil || len(rows) == 0 {
		if err != nil {
			log.Printf("ticket confirmation email details failed for order %s: %v", common.UUIDToString(orderID), err)
		}
		return err
	}
	if rows[0].TicketEmailSentAt.Valid {
		return nil
	}

	tickets := make([]email.TicketDelivery, 0, len(rows))
	for _, row := range rows {
		tickets = append(tickets, email.TicketDelivery{
			ID:             common.UUIDToString(row.TicketID),
			StartTime:      row.StartTime.Time,
			TicketTypeName: row.TicketTypeName,
			ValidationHash: row.ValidationHash,
		})
	}

	if err := h.mailer.SendTicketConfirmationEmail(ctx, rows[0].Email, rows[0].EventTitle, rows[0].LocationName, rows[0].UserID.Valid, tickets); err != nil {
		log.Printf("ticket confirmation email failed for order %s: %v", common.UUIDToString(orderID), err)
		return err
	}
	if err := h.queries.MarkTicketEmailSent(ctx, orderID); err != nil {
		log.Printf("ticket confirmation email could not be marked sent for order %s: %v", common.UUIDToString(orderID), err)
		return err
	}
	return nil
}

// ReleaseExpiredCheckout releases inventory only for the exact Checkout Session
// persisted on the order. Metadata is deliberately not accepted as authority.
func (h *CheckoutHandler) ReleaseExpiredCheckout(ctx context.Context, session stripe.CheckoutSession, connectedAccountID string) error {
	if strings.TrimSpace(session.ID) == "" || session.Status != stripe.CheckoutSessionStatusExpired {
		return nil
	}
	if !h.acceptsStripeLiveMode(session.Livemode) {
		return errors.New("mediul Stripe din sesiunea expirata nu corespunde configuratiei API")
	}

	tx, err := h.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)
	order, err := qtx.GetOrderByCheckoutSessionForUpdate(ctx, pgtype.Text{String: session.ID, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return tx.Commit(ctx)
	}
	if err != nil {
		return err
	}
	if !stripeOrderContextMatches(order, connectedAccountID) {
		return errors.New("contextul contului Stripe nu corespunde comenzii expirate")
	}
	if order.StripeLivemode.Valid && order.StripeLivemode.Bool != session.Livemode {
		return errors.New("mediul Stripe din sesiunea expirata nu corespunde comenzii")
	}
	if order.Status != db.OrderStatusPending {
		return tx.Commit(ctx)
	}
	if order.PromoCodeID.Valid {
		if err := qtx.DecrementPromoCodeRedemption(ctx, order.PromoCodeID); err != nil {
			return err
		}
	}
	items, err := qtx.GetOrderItems(ctx, order.ID)
	if err != nil {
		return err
	}
	for _, item := range items {
		if err := qtx.DecrementTicketsSold(ctx, db.DecrementTicketsSoldParams{
			ID:          item.TicketTypeID,
			TicketsSold: item.Quantity,
		}); err != nil {
			return err
		}
	}
	if err := qtx.UpdateOrderStatus(ctx, db.UpdateOrderStatusParams{
		ID:     order.ID,
		Status: db.OrderStatusFailed,
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func markPaidCheckoutForRefundReviewLocked(ctx context.Context, qtx *db.Queries, tx pgx.Tx, orderID pgtype.UUID, reason string) error {
	if err := qtx.MarkCheckoutReservationForReview(ctx, db.MarkCheckoutReservationForReviewParams{
		OrderID: orderID,
		Reason:  reason,
	}); err != nil {
		return err
	}
	if err := qtx.MarkOrderRefundNeedsAttention(ctx, orderID); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	log.Printf("SECURITY paid checkout requires refund review: order=%s reason=%s", common.UUIDToString(orderID), reason)
	return nil
}

func (h *CheckoutHandler) ReconcileChargeRefund(ctx context.Context, charge stripe.Charge, connectedAccountID string, liveMode bool) error {
	order, err := h.findStripeOrder(ctx, charge.Metadata, stripePaymentIntentID(charge.PaymentIntent), charge.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		log.Printf("SECURITY Stripe refund could not be associated with an order: charge=%s payment_intent=%s account=%s", charge.ID, stripePaymentIntentID(charge.PaymentIntent), connectedAccountID)
		return nil
	}
	if err != nil {
		if order.ID.Valid && errors.Is(err, errStripeRefundBindingMismatch) {
			if order.Status == db.OrderStatusPending && order.StripeCheckoutSessionID.Valid {
				boundOrder, bindErr := h.bindPendingRefundFromCheckoutSession(ctx, order, charge, connectedAccountID, liveMode)
				if bindErr == nil {
					order = boundOrder
					err = nil
					if h.afterPendingRefundBound != nil {
						h.afterPendingRefundBound()
					}
				} else if !errors.Is(bindErr, errStripeRefundBindingMismatch) {
					return bindErr
				} else {
					// Another webhook may have completed or bound the order while the
					// Checkout Session was being retrieved. Resolve immutable IDs once
					// more before treating the event as suspicious.
					refreshed, refreshErr := h.findStripeOrder(ctx, charge.Metadata, stripePaymentIntentID(charge.PaymentIntent), charge.ID)
					if refreshErr == nil {
						order = refreshed
						err = nil
					} else if !errors.Is(refreshErr, pgx.ErrNoRows) && !errors.Is(refreshErr, errStripeRefundBindingMismatch) {
						return refreshErr
					} else {
						if refreshed.ID.Valid {
							order = refreshed
						}
						err = errors.Join(err, bindErr, refreshErr)
					}
				}
			}
			if err != nil {
				if accountErr := validateStripeChargeAccountContext(order, charge, connectedAccountID); accountErr == nil && order.StripeLivemode.Valid && order.StripeLivemode.Bool == liveMode && charge.Livemode == liveMode {
					return h.flagRefundBindingForReview(ctx, order, charge.ID, err)
				}
				log.Printf("SECURITY rejected unbound Stripe refund without changing an order: charge=%s payment_intent=%s reason=%v", charge.ID, stripePaymentIntentID(charge.PaymentIntent), err)
				return nil
			}
		}
		if err != nil {
			return err
		}
	}
	if err := validateRefundedCharge(order, charge, connectedAccountID, liveMode); err != nil {
		return h.flagRefundBindingForReview(ctx, order, charge.ID, err)
	}

	tx, err := h.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)
	order, err = qtx.GetOrderForUpdate(ctx, order.ID)
	if err != nil {
		return err
	}
	if err := validateRefundedCharge(order, charge, connectedAccountID, liveMode); err != nil {
		if flagErr := qtx.MarkOrderRefundNeedsAttention(ctx, order.ID); flagErr != nil {
			return errors.Join(err, flagErr)
		}
		if commitErr := tx.Commit(ctx); commitErr != nil {
			return errors.Join(err, commitErr)
		}
		log.Printf("SECURITY Stripe refund requires review after order lock: order=%s charge=%s reason=%v", common.UUIDToString(order.ID), charge.ID, err)
		return nil
	}
	if charge.AmountRefunded < order.StripeAmountRefundedBani {
		return tx.Commit(ctx)
	}

	fullRefund := stripeChargeFullyRefunded(charge)
	refundStatus := "partial"
	needsAttention := true
	if fullRefund {
		refundStatus = "succeeded"
		needsAttention = false
	}

	if fullRefund && (order.Status == db.OrderStatusCompleted || order.Status == db.OrderStatusPending) {
		items, itemsErr := qtx.GetOrderItems(ctx, order.ID)
		if itemsErr != nil {
			return itemsErr
		}
		for _, item := range items {
			if err := qtx.DecrementTicketsSold(ctx, db.DecrementTicketsSoldParams{
				ID:          item.TicketTypeID,
				TicketsSold: item.Quantity,
			}); err != nil {
				return err
			}
		}
		if order.PromoCodeID.Valid {
			if err := qtx.DecrementPromoCodeRedemption(ctx, order.PromoCodeID); err != nil {
				return err
			}
		}
	}

	if err := qtx.UpdateOrderRefundState(ctx, db.UpdateOrderRefundStateParams{
		ID:                 order.ID,
		StripeChargeID:     charge.ID,
		AmountRefundedBani: charge.AmountRefunded,
		RefundStatus:       refundStatus,
		NeedsAttention:     needsAttention,
		MarkRefunded:       fullRefund,
	}); err != nil {
		return err
	}

	operation, operationErr := qtx.GetOrderRefundOperation(ctx, order.ID)
	manualFeeRefundQueued := false
	if operationErr != nil && !errors.Is(operationErr, pgx.ErrNoRows) {
		return operationErr
	}
	if fullRefund {
		if errors.Is(operationErr, pgx.ErrNoRows) || (operationErr == nil && operation.Source == "stripe_dashboard" && operation.FeePolicy == "review") {
			// A full refund without a Spottr operation was initiated directly in
			// Stripe. It must not remain commissionable: queue a separate refund
			// of the Application Fee back to the connected account.
			operation, operationErr = qtx.UpsertManualRefundOperation(ctx, db.UpsertManualRefundOperationParams{
				OrderID: order.ID, FeePolicy: "refund", Status: "pending", StripeRefundID: pgtype.Text{}, RefundAmountBani: charge.AmountRefunded,
			})
			if operationErr != nil {
				return operationErr
			}
			if err := qtx.MarkOrderPlatformFeePending(ctx, db.MarkOrderPlatformFeePendingParams{
				OrderID: order.ID, Status: "refund_pending", RefundOrigin: optionalText("stripe_dashboard"), NeedsAttention: false,
			}); err != nil {
				return err
			}
			manualFeeRefundQueued = true
		} else {
			if operation.FeePolicy == "refund" && operation.Status != "succeeded" {
				manualFeeRefundQueued = true
				if err := qtx.MarkOrderPlatformFeePending(ctx, db.MarkOrderPlatformFeePendingParams{OrderID: order.ID, Status: "refund_pending", RefundOrigin: optionalText(operation.Source), NeedsAttention: false}); err != nil {
					return err
				}
				if err := qtx.MarkOrderRefundSubmitted(ctx, db.MarkOrderRefundSubmittedParams{ID: operation.ID, Status: "pending", StripeRefundID: operation.StripeRefundID, StripeApplicationFeeID: operation.StripeApplicationFeeID}); err != nil {
					return err
				}
			} else if operation.FeePolicy == "retain" {
				if err := qtx.MarkOrderPlatformFeeRetained(ctx, db.MarkOrderPlatformFeeRetainedParams{OrderID: order.ID, RefundOrigin: optionalText(operation.Source)}); err != nil {
					return err
				}
			}
			if !manualFeeRefundQueued {
				if err := qtx.MarkOrderRefundSubmitted(ctx, db.MarkOrderRefundSubmittedParams{ID: operation.ID, Status: "succeeded", StripeRefundID: operation.StripeRefundID, StripeApplicationFeeID: operation.StripeApplicationFeeID}); err != nil {
					return err
				}
			}
		}
	} else {
		refundOrigin := "stripe_dashboard"
		if operationErr == nil && operation.Source == "event_cancellation" {
			refundOrigin = operation.Source
		}
		_, operationErr = qtx.UpsertManualRefundOperation(ctx, db.UpsertManualRefundOperationParams{
			OrderID: order.ID, FeePolicy: "review", Status: "needs_review", StripeRefundID: pgtype.Text{}, RefundAmountBani: charge.AmountRefunded,
		})
		if operationErr != nil {
			return operationErr
		}
		if err := qtx.MarkOrderPlatformFeePending(ctx, db.MarkOrderPlatformFeePendingParams{
			OrderID: order.ID, Status: "needs_review", RefundOrigin: optionalText(refundOrigin), NeedsAttention: true,
		}); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}

	if fullRefund && order.AutomaticInvoiceRefundEnabled && h.invoicing != nil {
		if err := h.invoicing.QueueOrderRefund(ctx, order.ID); err != nil {
			log.Printf("invoice refund could not be queued for order %s: %v", common.UUIDToString(order.ID), err)
		}
	}
	if manualFeeRefundQueued {
		go h.processRefundBatch(context.Background())
	}
	return nil
}

func (h *CheckoutHandler) RecordRefundEvent(ctx context.Context, refund stripe.Refund, connectedAccountID string, liveMode bool) error {
	if refund.Status == stripe.RefundStatusSucceeded {
		// charge.refunded is the authoritative cumulative event and handles both
		// a single full refund and multiple partial refunds idempotently.
		return nil
	}
	order, err := h.findStripeOrder(ctx, refund.Metadata, stripePaymentIntentID(refund.PaymentIntent), stripeChargeID(refund.Charge))
	if errors.Is(err, pgx.ErrNoRows) {
		log.Printf("SECURITY Stripe refund status could not be associated with an order: refund=%s charge=%s payment_intent=%s account=%s", refund.ID, stripeChargeID(refund.Charge), stripePaymentIntentID(refund.PaymentIntent), connectedAccountID)
		return nil
	}
	if err != nil {
		if order.ID.Valid && errors.Is(err, errStripeRefundBindingMismatch) {
			// Refund status events do not contain a trustworthy cumulative amount.
			// Never let mutable metadata alone place a pending order on hold;
			// charge.refunded performs the authoritative, verified reconciliation.
			log.Printf("SECURITY rejected unbound Stripe refund status event without changing an order: refund=%s charge=%s reason=%v", refund.ID, stripeChargeID(refund.Charge), err)
			return nil
		}
		return err
	}
	if !stripeOrderContextMatches(order, connectedAccountID) {
		return h.flagRefundBindingForReview(ctx, order, stripeChargeID(refund.Charge), fmt.Errorf("%w: refund account differs from the order", errStripeRefundBindingMismatch))
	}
	if !order.StripeLivemode.Valid || order.StripeLivemode.Bool != liveMode {
		return h.flagRefundBindingForReview(ctx, order, stripeChargeID(refund.Charge), fmt.Errorf("%w: refund mode differs from the order", errStripeRefundBindingMismatch))
	}
	if order.Status == db.OrderStatusRefunded || order.StripeAmountRefundedBani > 0 {
		// A delayed status from an individual refund attempt must not regress the
		// authoritative cumulative state written from charge.refunded.
		return nil
	}
	status := string(refund.Status)
	needsAttention := true
	switch refund.Status {
	case stripe.RefundStatusPending, stripe.RefundStatusRequiresAction:
	case stripe.RefundStatusFailed, stripe.RefundStatusCanceled:
		status = "failed"
		needsAttention = false
	default:
		return nil
	}
	return h.queries.UpdateOrderRefundState(ctx, db.UpdateOrderRefundStateParams{
		ID:                 order.ID,
		StripeChargeID:     stripeChargeID(refund.Charge),
		AmountRefundedBani: order.StripeAmountRefundedBani,
		RefundStatus:       status,
		NeedsAttention:     needsAttention,
		MarkRefunded:       false,
	})
}

func (h *CheckoutHandler) findStripeOrder(ctx context.Context, metadata map[string]string, paymentIntentID, chargeID string) (db.Orders, error) {
	var resolved db.Orders
	resolvedByImmutableID := false
	if paymentIntentID != "" {
		order, err := h.queries.GetOrderByStripePaymentIntent(ctx, pgtype.Text{String: paymentIntentID, Valid: true})
		if err == nil {
			resolved = order
			resolvedByImmutableID = true
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return db.Orders{}, err
		}
	}
	if chargeID != "" {
		order, err := h.queries.GetOrderByStripeChargeID(ctx, pgtype.Text{String: chargeID, Valid: true})
		if err == nil {
			if resolvedByImmutableID && order.ID != resolved.ID {
				return resolved, fmt.Errorf("%w: PaymentIntent and Charge resolve to different orders", errStripeRefundBindingMismatch)
			}
			resolved = order
			resolvedByImmutableID = true
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return db.Orders{}, err
		}
	}
	if resolvedByImmutableID {
		return validateResolvedStripeOrder(resolved, metadata, paymentIntentID, chargeID)
	}
	if orderID := firstStripeMetadata(metadata, "spottr_order_id", "pulse_order_id"); orderID != "" {
		var parsedOrderID pgtype.UUID
		if err := parsedOrderID.Scan(orderID); err == nil && parsedOrderID.Valid {
			order, lookupErr := h.queries.GetOrderForUpdate(ctx, parsedOrderID)
			if lookupErr != nil {
				return db.Orders{}, lookupErr
			}
			if !stripeOrderHasExactPaymentIdentifier(order, paymentIntentID, chargeID) {
				return order, fmt.Errorf("%w: metadata order is not bound to the PaymentIntent or Charge", errStripeRefundBindingMismatch)
			}
			return validateResolvedStripeOrder(order, metadata, paymentIntentID, chargeID)
		}
	}
	return db.Orders{}, pgx.ErrNoRows
}

func validateResolvedStripeOrder(order db.Orders, metadata map[string]string, paymentIntentID, chargeID string) (db.Orders, error) {
	if order.StripePaymentIntentID.Valid && paymentIntentID != "" && order.StripePaymentIntentID.String != paymentIntentID {
		return order, fmt.Errorf("%w: PaymentIntent differs from the stored order", errStripeRefundBindingMismatch)
	}
	if order.StripeChargeID.Valid && chargeID != "" && order.StripeChargeID.String != chargeID {
		return order, fmt.Errorf("%w: Charge differs from the stored order", errStripeRefundBindingMismatch)
	}
	if !stripeOrderHasExactPaymentIdentifier(order, paymentIntentID, chargeID) {
		return db.Orders{}, fmt.Errorf("%w: no immutable payment identifier matched", errStripeRefundBindingMismatch)
	}
	if metadataOrderID := firstStripeMetadata(metadata, "spottr_order_id", "pulse_order_id"); metadataOrderID != "" && metadataOrderID != common.UUIDToString(order.ID) {
		log.Printf("SECURITY ignoring mismatched Stripe refund metadata: resolved_order=%s metadata_order=%s payment_intent=%s charge=%s", common.UUIDToString(order.ID), metadataOrderID, paymentIntentID, chargeID)
	}
	return order, nil
}

func stripeOrderHasExactPaymentIdentifier(order db.Orders, paymentIntentID, chargeID string) bool {
	return (paymentIntentID != "" && order.StripePaymentIntentID.Valid && order.StripePaymentIntentID.String == paymentIntentID) ||
		(chargeID != "" && order.StripeChargeID.Valid && order.StripeChargeID.String == chargeID)
}

func validateRefundedCharge(order db.Orders, charge stripe.Charge, connectedAccountID string, liveMode bool) error {
	if !stripeOrderHasExactPaymentIdentifier(order, stripePaymentIntentID(charge.PaymentIntent), charge.ID) {
		return fmt.Errorf("%w: Charge identifiers are not bound to the order", errStripeRefundBindingMismatch)
	}
	if !order.StripeLivemode.Valid || order.StripeLivemode.Bool != liveMode || charge.Livemode != liveMode {
		return fmt.Errorf("%w: Stripe mode differs from the stored order or event", errStripeRefundBindingMismatch)
	}
	if charge.Currency != stripe.CurrencyRON {
		return fmt.Errorf("%w: unexpected currency %q", errStripeRefundBindingMismatch, charge.Currency)
	}
	expectedAmount := int64(order.TotalAmount)*100 + int64(order.CustomerTicketingFeeBani)
	if expectedAmount <= 0 || charge.Amount != expectedAmount {
		return fmt.Errorf("%w: expected %d bani, Charge contains %d", errStripeRefundBindingMismatch, expectedAmount, charge.Amount)
	}
	if charge.AmountRefunded < 0 || charge.AmountRefunded > charge.Amount {
		return fmt.Errorf("%w: invalid cumulative refunded amount %d", errStripeRefundBindingMismatch, charge.AmountRefunded)
	}
	return validateStripeChargeAccountContext(order, charge, connectedAccountID)
}

func validateStripeChargeAccountContext(order db.Orders, charge stripe.Charge, connectedAccountID string) error {
	if order.StripeChargeType.Valid && order.StripeChargeType.String == directChargeType {
		if !order.StripeConnectedAccountID.Valid || connectedAccountID == "" || connectedAccountID != order.StripeConnectedAccountID.String {
			return fmt.Errorf("%w: direct Charge account differs from the order", errStripeRefundBindingMismatch)
		}
		return nil
	}
	if !order.StripeChargeType.Valid || order.StripeChargeType.String != "destination" || connectedAccountID != "" || !order.StripeConnectedAccountID.Valid ||
		charge.TransferData == nil || charge.TransferData.Destination == nil || charge.TransferData.Destination.ID != order.StripeConnectedAccountID.String {
		return fmt.Errorf("%w: destination Charge account differs from the order", errStripeRefundBindingMismatch)
	}
	return nil
}

func (h *CheckoutHandler) retrieveCheckoutSession(ctx context.Context, sessionID, connectedAccountID string) (*stripe.CheckoutSession, error) {
	if h.retrieveSession != nil {
		return h.retrieveSession(ctx, sessionID, connectedAccountID)
	}
	if h.client == nil {
		return nil, errors.New("Stripe checkout client is not configured")
	}
	params := &stripe.CheckoutSessionRetrieveParams{}
	if connectedAccountID != "" {
		params.SetStripeAccount(connectedAccountID)
	}
	return h.client.V1CheckoutSessions.Retrieve(ctx, sessionID, params)
}

func (h *CheckoutHandler) bindPendingRefundFromCheckoutSession(ctx context.Context, order db.Orders, charge stripe.Charge, connectedAccountID string, liveMode bool) (db.Orders, error) {
	if order.Status != db.OrderStatusPending || !order.StripeCheckoutSessionID.Valid || order.StripeCheckoutSessionID.String == "" {
		return db.Orders{}, fmt.Errorf("%w: pending order has no Checkout Session anchor", errStripeRefundBindingMismatch)
	}
	paymentIntentID := stripePaymentIntentID(charge.PaymentIntent)
	if paymentIntentID == "" || charge.ID == "" {
		return db.Orders{}, fmt.Errorf("%w: refunded Charge has no immutable identifiers", errStripeRefundBindingMismatch)
	}
	if err := validatePendingRefundChargeSnapshot(order, charge, connectedAccountID, liveMode); err != nil {
		return db.Orders{}, err
	}
	retrieveAccountID := ""
	if order.StripeChargeType.Valid && order.StripeChargeType.String == directChargeType {
		retrieveAccountID = order.StripeConnectedAccountID.String
	}
	session, err := h.retrieveCheckoutSession(ctx, order.StripeCheckoutSessionID.String, retrieveAccountID)
	if err != nil {
		return db.Orders{}, err
	}
	if err := validateRefundCheckoutSession(order, charge, session, liveMode); err != nil {
		return db.Orders{}, err
	}

	tx, err := h.db.Begin(ctx)
	if err != nil {
		return db.Orders{}, err
	}
	defer tx.Rollback(ctx)
	qtx := h.queries.WithTx(tx)
	locked, err := qtx.GetOrderForUpdate(ctx, order.ID)
	if err != nil {
		return db.Orders{}, err
	}
	if locked.Status != db.OrderStatusPending || !locked.StripeCheckoutSessionID.Valid || locked.StripeCheckoutSessionID.String != session.ID ||
		!locked.StripeLivemode.Valid || locked.StripeLivemode.Bool != liveMode {
		return db.Orders{}, fmt.Errorf("%w: pending order changed during Checkout Session verification", errStripeRefundBindingMismatch)
	}
	if err := validatePendingRefundChargeSnapshot(locked, charge, connectedAccountID, liveMode); err != nil {
		return db.Orders{}, err
	}
	bound, err := qtx.BindPendingOrderStripePayment(ctx, db.BindPendingOrderStripePaymentParams{
		ID:                      locked.ID,
		StripePaymentIntentID:   paymentIntentID,
		StripeChargeID:          charge.ID,
		StripeCheckoutSessionID: session.ID,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.Is(err, pgx.ErrNoRows) || (errors.As(err, &pgErr) && pgErr.Code == "23505") {
			return db.Orders{}, fmt.Errorf("%w: pending payment identifiers changed or are already bound", errStripeRefundBindingMismatch)
		}
		return db.Orders{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return db.Orders{}, err
	}
	log.Printf("Stripe pending order payment bound through verified Checkout Session: order=%s session=%s payment_intent=%s charge=%s", common.UUIDToString(bound.ID), session.ID, paymentIntentID, charge.ID)
	return bound, nil
}

func validatePendingRefundChargeSnapshot(order db.Orders, charge stripe.Charge, connectedAccountID string, liveMode bool) error {
	if !order.StripeLivemode.Valid || order.StripeLivemode.Bool != liveMode || charge.Livemode != liveMode {
		return fmt.Errorf("%w: Stripe mode differs from the pending order or event", errStripeRefundBindingMismatch)
	}
	if charge.Currency != stripe.CurrencyRON {
		return fmt.Errorf("%w: unexpected currency %q", errStripeRefundBindingMismatch, charge.Currency)
	}
	expectedAmount := int64(order.TotalAmount)*100 + int64(order.CustomerTicketingFeeBani)
	if expectedAmount <= 0 || charge.Amount != expectedAmount || charge.AmountRefunded < 0 || charge.AmountRefunded > charge.Amount {
		return fmt.Errorf("%w: refunded Charge amount differs from the pending order", errStripeRefundBindingMismatch)
	}
	return validateStripeChargeAccountContext(order, charge, connectedAccountID)
}

func validateRefundCheckoutSession(order db.Orders, charge stripe.Charge, session *stripe.CheckoutSession, liveMode bool) error {
	if session == nil || session.ID != order.StripeCheckoutSessionID.String || session.ClientReferenceID != common.UUIDToString(order.ID) {
		return fmt.Errorf("%w: Checkout Session identity differs from the pending order", errStripeRefundBindingMismatch)
	}
	if session.Mode != stripe.CheckoutSessionModePayment || session.Status != stripe.CheckoutSessionStatusComplete || session.PaymentStatus != stripe.CheckoutSessionPaymentStatusPaid {
		return fmt.Errorf("%w: Checkout Session is not a completed payment", errStripeRefundBindingMismatch)
	}
	if session.PaymentIntent == nil || session.PaymentIntent.ID == "" || session.PaymentIntent.ID != stripePaymentIntentID(charge.PaymentIntent) {
		return fmt.Errorf("%w: Checkout Session PaymentIntent differs from the refunded Charge", errStripeRefundBindingMismatch)
	}
	expectedAmount := int64(order.TotalAmount)*100 + int64(order.CustomerTicketingFeeBani)
	if session.Livemode != liveMode || session.Currency != stripe.CurrencyRON || session.AmountTotal != expectedAmount {
		return fmt.Errorf("%w: Checkout Session mode, currency, or amount differs from the order", errStripeRefundBindingMismatch)
	}
	return nil
}

func (h *CheckoutHandler) flagRefundBindingForReview(ctx context.Context, order db.Orders, chargeID string, reason error) error {
	if !order.ID.Valid {
		return reason
	}
	if err := h.queries.MarkOrderRefundNeedsAttention(ctx, order.ID); err != nil {
		return errors.Join(reason, err)
	}
	log.Printf("SECURITY Stripe refund requires review: order=%s charge=%s reason=%v", common.UUIDToString(order.ID), chargeID, reason)
	return nil
}

func stripePaymentIntentID(paymentIntent *stripe.PaymentIntent) string {
	if paymentIntent == nil {
		return ""
	}
	return paymentIntent.ID
}

func stripeChargeFullyRefunded(charge stripe.Charge) bool {
	return charge.Refunded || (charge.Amount > 0 && charge.AmountRefunded >= charge.Amount)
}

func stripeChargeID(charge *stripe.Charge) string {
	if charge == nil {
		return ""
	}
	return charge.ID
}

func (h *CheckoutHandler) failOrder(ctx context.Context, orderID pgtype.UUID, paymentIntentID, connectedAccountID string) error {
	tx, err := h.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)
	order, err := qtx.GetOrderForUpdate(ctx, orderID)
	if err != nil {
		return err
	}
	if !stripeOrderContextMatches(order, connectedAccountID) {
		return errors.New("contextul contului Stripe nu corespunde comenzii")
	}
	if order.Status != db.OrderStatusPending {
		return tx.Commit(ctx)
	}
	if order.PromoCodeID.Valid {
		if err := qtx.DecrementPromoCodeRedemption(ctx, order.PromoCodeID); err != nil {
			return err
		}
	}

	items, err := qtx.GetOrderItems(ctx, order.ID)
	if err != nil {
		return err
	}
	for _, item := range items {
		if err := qtx.DecrementTicketsSold(ctx, db.DecrementTicketsSoldParams{
			ID:          item.TicketTypeID,
			TicketsSold: item.Quantity,
		}); err != nil {
			return err
		}
	}

	if err := qtx.UpdateOrderStatus(ctx, db.UpdateOrderStatusParams{
		ID:                    order.ID,
		Status:                db.OrderStatusFailed,
		StripePaymentIntentID: pgtype.Text{String: paymentIntentID, Valid: paymentIntentID != ""},
	}); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func stripeOrderContextMatches(order db.Orders, connectedAccountID string) bool {
	if order.StripeChargeType.Valid && order.StripeChargeType.String == directChargeType {
		return order.StripeConnectedAccountID.Valid &&
			order.StripeConnectedAccountID.String != "" &&
			order.StripeConnectedAccountID.String == connectedAccountID
	}

	// Destination charges and legacy orders emit platform-scoped events. Never
	// allow such an event to fulfill a direct-charge order, or vice versa.
	return connectedAccountID == ""
}

func parseCheckoutItems(w http.ResponseWriter, requested []CheckoutItemRequest) (map[string]int32, int32, bool) {
	items := make(map[string]int32, len(requested))
	var total int32
	for _, item := range requested {
		if item.Quantity <= 0 || item.Quantity > 8 {
			router.RespondWithError(w, http.StatusBadRequest, "Cantitatea pentru fiecare tip de bilet trebuie sa fie intre 1 si 8")
			return nil, 0, false
		}
		var ticketTypeID pgtype.UUID
		if err := ticketTypeID.Scan(item.TicketTypeID); err != nil || !ticketTypeID.Valid {
			router.RespondWithError(w, http.StatusBadRequest, "ID-ul tipului de bilet este invalid")
			return nil, 0, false
		}
		items[item.TicketTypeID] += item.Quantity
		if items[item.TicketTypeID] > 8 {
			router.RespondWithError(w, http.StatusBadRequest, "Nu poti cumpara mai mult de 8 bilete din acelasi tip")
			return nil, 0, false
		}
		total += item.Quantity
		if total > 16 {
			router.RespondWithError(w, http.StatusBadRequest, "Nu poti cumpara mai mult de 16 bilete intr-o comanda")
			return nil, 0, false
		}
	}
	return items, total, true
}

func calculatePlatformFeeBani(totalBani int64, ticketCount int32) int64 {
	percentageFee := (totalBani*platformFeePercent + 99) / 100
	return percentageFee + int64(ticketCount)*platformFeePerTicketBani
}

func normalizeBillingDetails(details BillingDetailsRequest) (BillingDetailsRequest, error) {
	details.Type = strings.ToLower(strings.TrimSpace(details.Type))
	details.Name = strings.TrimSpace(details.Name)
	details.TaxID = strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(details.TaxID), " ", ""))
	details.RegistrationNumber = strings.TrimSpace(details.RegistrationNumber)
	details.Address = strings.TrimSpace(details.Address)
	details.City = strings.TrimSpace(details.City)
	details.County = strings.TrimSpace(details.County)
	details.Sector = strings.TrimSpace(details.Sector)
	details.Country = strings.TrimSpace(details.Country)
	if details.Type == "" {
		details.Type = "individual"
	}
	if details.Country == "" {
		details.Country = "Romania"
	}
	if len(details.Name) > 255 || len(details.TaxID) > 32 || len(details.RegistrationNumber) > 64 ||
		len(details.Address) > 500 || len(details.City) > 128 || len(details.County) > 128 ||
		len(details.Sector) > 16 || len(details.Country) > 64 {
		return BillingDetailsRequest{}, errors.New("datele de facturare depasesc lungimea permisa")
	}
	if details.Type != "individual" && details.Type != "company" {
		return BillingDetailsRequest{}, errors.New("tipul datelor de facturare este invalid")
	}
	if len(details.Name) < 2 {
		return BillingDetailsRequest{}, errors.New("numele pentru factura este obligatoriu")
	}
	if details.Type == "company" && details.TaxID == "" {
		return BillingDetailsRequest{}, errors.New("CUI-ul companiei este obligatoriu pentru factura")
	}
	if details.Type == "individual" {
		details.TaxID = ""
		details.RegistrationNumber = ""
	}
	if details.Address == "" || details.City == "" || details.Country == "" {
		return BillingDetailsRequest{}, errors.New("adresa, localitatea si tara sunt obligatorii pentru factura")
	}
	if isBucharestAddress(details.City, details.Country) {
		details.City = "Bucuresti"
		details.County = "Bucuresti"
		if !isValidBucharestSector(details.Sector) {
			return BillingDetailsRequest{}, errors.New("selecteaza sectorul adresei din Bucuresti")
		}
	} else {
		details.Sector = ""
		if details.County == "" {
			return BillingDetailsRequest{}, errors.New("judetul este obligatoriu pentru factura")
		}
	}
	return details, nil
}

func isBucharestAddress(city, country string) bool {
	normalizedCity := strings.NewReplacer("ă", "a", "â", "a", "î", "i", "ș", "s", "ş", "s", "ț", "t", "ţ", "t").Replace(strings.ToLower(strings.TrimSpace(city)))
	normalizedCountry := strings.NewReplacer("â", "a", "î", "i").Replace(strings.ToLower(strings.TrimSpace(country)))
	return (normalizedCountry == "romania" || normalizedCountry == "ro") && (normalizedCity == "bucuresti" || normalizedCity == "bucharest")
}

func isValidBucharestSector(sector string) bool {
	switch strings.ToLower(strings.TrimSpace(sector)) {
	case "sector 1", "sector 2", "sector 3", "sector 4", "sector 5", "sector 6":
		return true
	default:
		return false
	}
}

func optionalUserID(ctx context.Context) pgtype.UUID {
	userIDString, err := auth.GetUserIDFromContext(ctx)
	if err != nil || userIDString == "" {
		return pgtype.UUID{}
	}

	var userID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil {
		return pgtype.UUID{}
	}
	return userID
}

func generateValidationHash() (string, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}
