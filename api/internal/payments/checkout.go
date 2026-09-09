package payments

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/mail"
	"sort"
	"strings"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/email"
	"pulse-api/internal/organizer"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stripe/stripe-go/v85"
)

const (
	platformFeePercent       = int64(4)
	platformFeePerTicketBani = int64(250)
	checkoutExpiration       = 30 * time.Minute
)

type CheckoutHandler struct {
	queries    *db.Queries
	db         *pgxpool.Pool
	client     *stripe.Client
	appURL     string
	mailer     *email.Mailer
	configured bool
}

type CheckoutItemRequest struct {
	TicketTypeID string `json:"ticketTypeId"`
	Quantity     int32  `json:"quantity"`
}

type CreateCheckoutRequest struct {
	Email     string                `json:"email"`
	Items     []CheckoutItemRequest `json:"items"`
	PromoCode string                `json:"promoCode"`
}

type CreateCheckoutResponse struct {
	CheckoutURL string `json:"checkoutUrl"`
	OrderID     string `json:"orderId"`
}

type checkoutItem struct {
	ticketType db.TicketTypes
	quantity   int32
	unitPrice  int32
}

func NewCheckoutHandler(queries *db.Queries, pool *pgxpool.Pool, stripeSecret, appURL string, mailer *email.Mailer) *CheckoutHandler {
	if appURL == "" {
		appURL = "http://localhost:3000"
	}

	return &CheckoutHandler{
		queries:    queries,
		db:         pool,
		client:     stripe.NewClient(stripeSecret),
		appURL:     strings.TrimRight(appURL, "/"),
		mailer:     mailer,
		configured: stripeSecret != "",
	}
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Datele comenzii sunt invalide")
		return
	}

	req.Email = strings.TrimSpace(req.Email)
	if address, err := mail.ParseAddress(req.Email); err != nil || address.Address != req.Email {
		router.RespondWithError(w, http.StatusBadRequest, "Adresa de email este invalida")
		return
	}
	if len(req.Items) == 0 {
		router.RespondWithError(w, http.StatusBadRequest, "Selecteaza cel putin un bilet")
		return
	}

	var eventID pgtype.UUID
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul evenimentului este invalid")
		return
	}

	userID := optionalUserID(r.Context())
	items, totalTicketCount, ok := parseCheckoutItems(w, req.Items)
	if !ok {
		return
	}

	order, checkoutItems, eventTitle, eventIDString, organizerStripeAccount, organizerAbsorbsServiceFee, err := h.reserveOrder(r.Context(), eventID, userID, req.Email, items, totalTicketCount, req.PromoCode)
	if err != nil {
		var requestError *checkoutRequestError
		if errors.As(err, &requestError) {
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
			"pulse_order_id": common.UUIDToString(order.ID),
			"pulse_event_id": eventIDString,
		},
		PaymentIntentData: &stripe.CheckoutSessionCreatePaymentIntentDataParams{
			ApplicationFeeAmount: stripe.Int64(int64(order.PlatformFeeBani)),
			OnBehalfOf:           stripe.String(organizerStripeAccount),
			ReceiptEmail:         stripe.String(req.Email),
			TransferData: &stripe.CheckoutSessionCreatePaymentIntentDataTransferDataParams{
				Destination: stripe.String(organizerStripeAccount),
			},
			Metadata: map[string]string{
				"pulse_order_id": common.UUIDToString(order.ID),
				"pulse_event_id": eventIDString,
			},
		},
	}
	params.SetIdempotencyKey("pulse-checkout-" + common.UUIDToString(order.ID))

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
				UnitAmount: stripe.Int64(int64(order.PlatformFeeBani)),
				ProductData: &stripe.CheckoutSessionCreateLineItemPriceDataProductDataParams{
					Name: stripe.String("Taxa de servicii Spottr"),
				},
			},
		})
	}

	session, err := h.client.V1CheckoutSessions.Create(r.Context(), params)
	if err != nil {
		_ = h.failOrder(r.Context(), order.ID, "")
		if isStripeAccountMissing(err) {
			if _, clearErr := h.queries.ClearOrganizerStripeAccount(r.Context(), pgtype.Text{String: organizerStripeAccount, Valid: true}); clearErr != nil && !errors.Is(clearErr, pgx.ErrNoRows) {
				log.Printf("Stripe account cleanup failed after checkout destination disappeared: account=%s err=%v", organizerStripeAccount, clearErr)
			}
			router.RespondWithError(w, http.StatusConflict, "Organizatorul trebuie sa reconecteze contul Stripe inainte de a putea accepta plati")
			return
		}
		router.RespondWithError(w, http.StatusBadGateway, "Sesiunea de plata Stripe nu a putut fi creata")
		return
	}

	if err := h.queries.UpdateOrderCheckoutSession(r.Context(), db.UpdateOrderCheckoutSessionParams{
		ID:                      order.ID,
		StripeCheckoutSessionID: pgtype.Text{String: session.ID, Valid: true},
	}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Sesiunea de plata nu a putut fi salvata")
		return
	}

	router.RespondWithJSON(w, http.StatusCreated, CreateCheckoutResponse{
		CheckoutURL: session.URL,
		OrderID:     common.UUIDToString(order.ID),
	})
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Date invalide")
		return
	}

	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if code == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Codul promo este obligatoriu")
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

func (h *CheckoutHandler) reserveOrder(ctx context.Context, eventID, userID pgtype.UUID, email string, requested map[string]int32, totalTicketCount int32, rawPromoCode string) (db.Orders, []checkoutItem, string, string, string, bool, error) {
	tx, err := h.db.Begin(ctx)
	if err != nil {
		return db.Orders{}, nil, "", "", "", false, err
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)
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

	profile, err := qtx.GetOrganizerProfile(ctx, event.OrganizerID)
	if err != nil || !organizer.CanSellTickets(profile) || !profile.StripeAccountID.Valid {
		return db.Orders{}, nil, "", "", "", false, &checkoutRequestError{status: http.StatusConflict, message: "Organizatorul nu poate accepta plati pentru acest eveniment"}
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

	for _, item := range items {
		if err := qtx.IncrementTicketsSold(ctx, db.IncrementTicketsSoldParams{
			ID:          item.ticketType.ID,
			TicketsSold: item.quantity,
		}); err != nil {
			return db.Orders{}, nil, "", "", "", false, err
		}
	}

	order, err := qtx.CreateCheckoutOrder(ctx, db.CreateCheckoutOrderParams{
		UserID:            userID,
		EventID:           eventID,
		Email:             email,
		TotalAmount:       int32(totalAmount),
		PlatformFeeBani:   int32(platformFeeBani),
		Status:            db.OrderStatusPending,
		PromoCodeID:       promoCodeID,
		DiscountAmountRon: int32(originalAmount - totalAmount),
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
		if _, err := tx.Exec(ctx, `UPDATE promo_codes SET redemptions_count=redemptions_count+1 WHERE id=$1`, promoCodeID); err != nil {
			return db.Orders{}, nil, "", "", "", false, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return db.Orders{}, nil, "", "", "", false, err
	}

	return order, items, event.Title, common.UUIDToString(eventID), profile.StripeAccountID.String, event.OrganizerAbsorbsServiceFee, nil
}

func (h *CheckoutHandler) FulfillCheckout(ctx context.Context, sessionID, paymentIntentID, orderID string) error {
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
	if order.Status == db.OrderStatusCompleted {
		if err := tx.Commit(ctx); err != nil {
			return err
		}
		h.deliverGuestTickets(order.ID)
		return nil
	}
	if order.Status != db.OrderStatusPending || (order.StripeCheckoutSessionID.Valid && order.StripeCheckoutSessionID.String != sessionID) {
		return tx.Commit(ctx)
	}

	items, err := qtx.GetOrderItems(ctx, order.ID)
	if err != nil {
		return err
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
	h.deliverGuestTickets(order.ID)
	return nil
}

func (h *CheckoutHandler) deliverGuestTickets(orderID pgtype.UUID) {
	if h.mailer == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	rows, err := h.queries.ListOrderTicketEmailDetails(ctx, orderID)
	if err != nil || len(rows) == 0 {
		if err != nil {
			log.Printf("guest ticket email details failed for order %s: %v", common.UUIDToString(orderID), err)
		}
		return
	}
	if rows[0].UserID.Valid || rows[0].TicketEmailSentAt.Valid {
		return
	}

	tickets := make([]email.TicketDelivery, 0, len(rows))
	for _, row := range rows {
		tickets = append(tickets, email.TicketDelivery{
			TicketTypeName: row.TicketTypeName,
			ValidationHash: row.ValidationHash,
		})
	}

	if err := h.mailer.SendGuestTicketEmail(ctx, rows[0].Email, rows[0].EventTitle, rows[0].LocationName, tickets); err != nil {
		log.Printf("guest ticket email failed for order %s: %v", common.UUIDToString(orderID), err)
		return
	}
	if err := h.queries.MarkGuestTicketEmailSent(ctx, orderID); err != nil {
		log.Printf("guest ticket email could not be marked sent for order %s: %v", common.UUIDToString(orderID), err)
	}
}

func (h *CheckoutHandler) FailCheckout(ctx context.Context, orderID, paymentIntentID string) error {
	var parsedOrderID pgtype.UUID
	if err := parsedOrderID.Scan(orderID); err != nil || !parsedOrderID.Valid {
		return nil
	}
	return h.failOrder(ctx, parsedOrderID, paymentIntentID)
}

func (h *CheckoutHandler) failOrder(ctx context.Context, orderID pgtype.UUID, paymentIntentID string) error {
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
	if order.Status != db.OrderStatusPending {
		return tx.Commit(ctx)
	}
	if order.PromoCodeID.Valid {
		if _, err := tx.Exec(ctx, `UPDATE promo_codes SET redemptions_count=GREATEST(0,redemptions_count-1) WHERE id=$1`, order.PromoCodeID); err != nil {
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
