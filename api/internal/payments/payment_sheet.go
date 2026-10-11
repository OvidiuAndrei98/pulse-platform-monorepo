package payments

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"
	"pulse-api/internal/router"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"
)

const checkoutClientNativeSheet = "native_sheet"

type nativePaymentSheetContextKey struct{}

type NativePaymentSheetResponse struct {
	Mode                      string `json:"mode"`
	OrderID                   string `json:"orderId"`
	PaymentIntentID           string `json:"paymentIntentId"`
	PaymentIntentClientSecret string `json:"paymentIntentClientSecret"`
	StripeAccountID           string `json:"stripeAccountId"`
	PublishableKey            string `json:"publishableKey"`
	ExpiresAt                 string `json:"expiresAt"`
}

type NativePaymentSheetRequest struct {
	OrderID                   string `json:"orderId"`
	EventID                   string `json:"eventId"`
	PaymentIntentID           string `json:"paymentIntentId"`
	PaymentIntentClientSecret string `json:"paymentIntentClientSecret"`
}

// ConfigureNativePaymentSheet leaves hosted Checkout available independently.
// The public and private keys must belong to the same Stripe platform account.
func (h *CheckoutHandler) ConfigureNativePaymentSheet(publishableKey string) {
	h.publishableKey = strings.TrimSpace(publishableKey)
}

func (h *CheckoutHandler) nativePaymentSheetConfigured() bool {
	if h == nil || !h.configured || !h.expectedLiveModeKnown {
		return false
	}
	prefix := "pk_test_"
	if h.expectedLiveMode {
		prefix = "pk_live_"
	}
	return strings.HasPrefix(h.publishableKey, prefix) && len(h.publishableKey) > len(prefix)
}

func (h *CheckoutHandler) nativePaymentIntentParams(order db.Orders, accountID string) *stripe.PaymentIntentCreateParams {
	params := &stripe.PaymentIntentCreateParams{
		Amount:               stripe.Int64(int64(order.TotalAmount)*100 + int64(order.CustomerTicketingFeeBani)),
		Currency:             stripe.String("ron"),
		ApplicationFeeAmount: stripe.Int64(int64(order.PlatformFeeBani)),
		CaptureMethod:        stripe.String("automatic"),
		PaymentMethodTypes:   []*string{stripe.String("card")},
		ReceiptEmail:         stripe.String(order.Email),
		Metadata: map[string]string{
			"spottr_order_id": common.UUIDToString(order.ID),
			"spottr_event_id": common.UUIDToString(order.EventID),
			"spottr_client":   checkoutClientNativeSheet,
		},
	}
	params.SetStripeAccount(accountID)
	params.SetIdempotencyKey("spottr-native-sheet-" + common.UUIDToString(order.ID))
	return params
}

func (h *CheckoutHandler) createNativePaymentSheet(w http.ResponseWriter, r *http.Request, order db.Orders, accountID string) {
	w.Header().Set("Cache-Control", "no-store")
	params := h.nativePaymentIntentParams(order, accountID)
	intent, err := h.client.V1PaymentIntents.Create(r.Context(), params)
	unknown := err != nil && !isDefinitiveStripeCreateFailure(err)
	if unknown {
		// A timeout may have happened after Stripe created the payable object.
		// Retry exactly the same provider idempotency key, never another PI.
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		intent, err = h.client.V1PaymentIntents.Create(ctx, params)
		cancel()
	}
	if err != nil {
		if unknown {
			h.markCheckoutReservationForReview(order.ID, "native_payment_create_outcome_unknown")
		} else {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			_ = h.failOrder(ctx, order.ID, "", accountID)
			cancel()
		}
		router.RespondWithError(w, http.StatusBadGateway, "Plata nu a putut fi pregatita. Reincearca.")
		return
	}
	if intent == nil || intent.ID == "" || intent.ClientSecret == "" {
		h.markCheckoutReservationForReview(order.ID, "native_payment_create_outcome_unknown")
		router.RespondWithError(w, http.StatusBadGateway, "Plata nu a putut fi confirmata")
		return
	}
	// Validate even the creation response before making its capability available
	// to the app. Binding is immutable and only a server-created native order can
	// receive it. Never rely on arbitrary Stripe metadata as proof of ownership.
	boundOrder := order
	boundOrder.StripePaymentIntentID = pgtype.Text{String: intent.ID, Valid: true}
	boundOrder.StripeLivemode = pgtype.Bool{Bool: h.expectedLiveMode, Valid: true}
	if h.validateNativePaymentIntent(boundOrder, intent, accountID) != nil {
		h.markCheckoutReservationForReview(order.ID, "native_payment_creation_binding_mismatch")
		router.RespondWithError(w, http.StatusBadGateway, "Plata nu a putut fi verificata")
		return
	}
	bind := func(ctx context.Context) error {
		result, err := h.db.Exec(ctx, `UPDATE orders SET stripe_payment_intent_id=$2, stripe_livemode=$3
WHERE id=$1 AND status='pending' AND stripe_checkout_session_id IS NULL
  AND (stripe_payment_intent_id IS NULL OR stripe_payment_intent_id=$2)
  AND EXISTS (SELECT 1 FROM native_payment_sheet_orders WHERE order_id=orders.id)`, order.ID, intent.ID, intent.Livemode)
		if err == nil && result.RowsAffected() != 1 {
			return errors.New("native payment binding lost ownership")
		}
		return err
	}
	if err = bind(r.Context()); err != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		err = bind(ctx)
		if err != nil {
			canceled, cancelErr := h.cancelNativePaymentIntent(ctx, intent.ID, accountID)
			if cancelErr == nil && canceled != nil && canceled.ID == intent.ID && canceled.Status == stripe.PaymentIntentStatusCanceled && h.validateNativePaymentIntent(boundOrder, canceled, accountID) == nil {
				_ = h.failOrder(ctx, order.ID, intent.ID, accountID)
			} else {
				h.markCheckoutReservationForReview(order.ID, "native_payment_binding_outcome_unknown")
			}
		}
		cancel()
		if err != nil {
			router.RespondWithError(w, http.StatusServiceUnavailable, "Plata este in curs de verificare. Reincearca.")
			return
		}
	}
	h.respondNativePaymentSheet(w, boundOrder, intent, order.CreatedAt.Time.Add(checkoutExpiration))
}

func (h *CheckoutHandler) respondNativePaymentSheet(w http.ResponseWriter, order db.Orders, intent *stripe.PaymentIntent, expiresAt time.Time) {
	w.Header().Set("Cache-Control", "no-store")
	router.RespondWithJSON(w, http.StatusCreated, NativePaymentSheetResponse{
		Mode: "payment_sheet", OrderID: common.UUIDToString(order.ID), PaymentIntentID: intent.ID,
		PaymentIntentClientSecret: intent.ClientSecret, StripeAccountID: order.StripeConnectedAccountID.String,
		PublishableKey: h.publishableKey, ExpiresAt: expiresAt.UTC().Format(time.RFC3339),
	})
}

func (h *CheckoutHandler) retrieveNativePaymentIntent(ctx context.Context, id, accountID string) (*stripe.PaymentIntent, error) {
	params := &stripe.PaymentIntentRetrieveParams{}
	params.SetStripeAccount(accountID)
	return h.client.V1PaymentIntents.Retrieve(ctx, id, params)
}

func (h *CheckoutHandler) cancelNativePaymentIntent(ctx context.Context, id, accountID string) (*stripe.PaymentIntent, error) {
	params := &stripe.PaymentIntentCancelParams{CancellationReason: stripe.String("abandoned")}
	params.SetStripeAccount(accountID)
	return h.client.V1PaymentIntents.Cancel(ctx, id, params)
}

func (h *CheckoutHandler) validateNativePaymentIntent(order db.Orders, intent *stripe.PaymentIntent, accountID string) error {
	if intent == nil || intent.ID == "" || !order.StripePaymentIntentID.Valid || intent.ID != order.StripePaymentIntentID.String ||
		order.StripeCheckoutSessionID.Valid || !order.StripeChargeType.Valid || order.StripeChargeType.String != directChargeType ||
		!stripeOrderContextMatches(order, accountID) || !order.StripeLivemode.Valid || order.StripeLivemode.Bool != intent.Livemode || !h.acceptsStripeLiveMode(intent.Livemode) {
		return errors.New("native payment identity does not match the order")
	}
	expectedAmount := int64(order.TotalAmount)*100 + int64(order.CustomerTicketingFeeBani)
	if expectedAmount <= 0 || intent.Amount != expectedAmount || string(intent.Currency) != "ron" ||
		intent.ApplicationFeeAmount != int64(order.PlatformFeeBani) || intent.CaptureMethod != stripe.PaymentIntentCaptureMethodAutomatic ||
		(intent.Status == stripe.PaymentIntentStatusSucceeded && intent.AmountReceived != expectedAmount) ||
		intent.Metadata["spottr_order_id"] != common.UUIDToString(order.ID) || intent.Metadata["spottr_event_id"] != common.UUIDToString(order.EventID) ||
		intent.Metadata["spottr_client"] != checkoutClientNativeSheet {
		return errors.New("native payment amount or metadata does not match the order")
	}
	return nil
}

func nativePaymentSecretMatches(expected, provided string) bool {
	return expected != "" && len(provided) <= 512 && subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) == 1
}

func (h *CheckoutHandler) nativePaymentOrder(ctx context.Context, orderID pgtype.UUID) (db.Orders, time.Time, error) {
	var expiresAt time.Time
	if err := h.db.QueryRow(ctx, `SELECT expires_at FROM native_payment_sheet_orders WHERE order_id=$1`, orderID).Scan(&expiresAt); err != nil {
		return db.Orders{}, time.Time{}, err
	}
	// GetOrderForUpdate is also safe outside an explicit transaction for this
	// read. Actual state transitions lock and re-read in their own transaction.
	order, err := h.queries.GetOrderForUpdate(ctx, orderID)
	return order, expiresAt, err
}

func (h *CheckoutHandler) replayNativePaymentSheet(w http.ResponseWriter, r *http.Request, requestID pgtype.UUID) {
	w.Header().Set("Cache-Control", "no-store")
	var orderID pgtype.UUID
	if err := h.db.QueryRow(r.Context(), `SELECT order_id FROM checkout_requests WHERE id=$1`, requestID).Scan(&orderID); err == nil && orderID.Valid {
		order, expiresAt, err := h.nativePaymentOrder(r.Context(), orderID)
		if err == nil && (order.Status == db.OrderStatusFailed || order.Status == db.OrderStatusRefunded) {
			router.RespondWithError(w, http.StatusConflict, "Aceasta plata s-a incheiat. Reincearca cu o comanda noua.")
			return
		}
		if err == nil && order.StripePaymentIntentID.Valid {
			intent, retrieveErr := h.retrieveNativePaymentIntent(r.Context(), order.StripePaymentIntentID.String, order.StripeConnectedAccountID.String)
			if retrieveErr == nil && h.validateNativePaymentIntent(order, intent, order.StripeConnectedAccountID.String) == nil {
				if !time.Now().Before(expiresAt) || intent.Status == stripe.PaymentIntentStatusCanceled {
					status, reconcileErr := h.reconcileNativePaymentIntent(r.Context(), order, intent, expiresAt, true)
					if reconcileErr != nil || status == "pending" {
						// Expiry does not prove cancellation. Do not return a 4xx that
						// permits a new purchase while the first payment is still live.
						w.Header().Set("Retry-After", "3")
						router.RespondWithError(w, http.StatusTooEarly, "Plata este in curs de verificare. Reincearca in cateva secunde.")
						return
					}
					if status != "completed" {
						router.RespondWithError(w, http.StatusConflict, "Sesiunea de plata s-a incheiat. Reincearca cu o comanda noua.")
						return
					}
				}
				if intent.ClientSecret != "" {
					// Retrieve anew: never store a guest payment capability in the
					// idempotency response JSON, logs or a navigation URL.
					h.respondNativePaymentSheet(w, order, intent, expiresAt)
					return
				}
			}
		}
	}
	w.Header().Set("Retry-After", "3")
	router.RespondWithError(w, http.StatusTooEarly, "Plata este in curs de pregatire sau verificare. Reincearca in cateva secunde.")
}

func (h *CheckoutHandler) HandleReconcilePaymentSheet(w http.ResponseWriter, r *http.Request) {
	h.handlePaymentSheetState(w, r, false)
}

func (h *CheckoutHandler) HandleCancelPaymentSheet(w http.ResponseWriter, r *http.Request) {
	h.handlePaymentSheetState(w, r, true)
}

func (h *CheckoutHandler) handlePaymentSheetState(w http.ResponseWriter, r *http.Request, cancelPayment bool) {
	w.Header().Set("Cache-Control", "no-store")
	if !h.configured {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Platile nu sunt configurate")
		return
	}
	var req NativePaymentSheetRequest
	if !router.DecodeJSON(w, r, &req, 2048) {
		return
	}
	var orderID, eventID pgtype.UUID
	if orderID.Scan(req.OrderID) != nil || !orderID.Valid || eventID.Scan(req.EventID) != nil || !eventID.Valid ||
		!strings.HasPrefix(req.PaymentIntentID, "pi_") || len(req.PaymentIntentID) > 255 || req.PaymentIntentClientSecret == "" || len(req.PaymentIntentClientSecret) > 512 {
		router.RespondWithError(w, http.StatusBadRequest, "Datele platii sunt invalide")
		return
	}
	order, expiresAt, err := h.nativePaymentOrder(r.Context(), orderID)
	if err != nil || order.EventID != eventID || !order.StripePaymentIntentID.Valid || order.StripePaymentIntentID.String != req.PaymentIntentID {
		router.RespondWithError(w, http.StatusNotFound, "Plata nu a fost gasita")
		return
	}
	intent, err := h.retrieveNativePaymentIntent(r.Context(), req.PaymentIntentID, order.StripeConnectedAccountID.String)
	if err != nil {
		router.RespondWithError(w, http.StatusBadGateway, "Plata nu a putut fi verificata. Reincearca.")
		return
	}
	if h.validateNativePaymentIntent(order, intent, order.StripeConnectedAccountID.String) != nil || !nativePaymentSecretMatches(intent.ClientSecret, req.PaymentIntentClientSecret) {
		router.RespondWithError(w, http.StatusNotFound, "Plata nu a fost gasita")
		return
	}
	status, err := h.reconcileNativePaymentIntent(r.Context(), order, intent, expiresAt, cancelPayment)
	if err != nil {
		router.RespondWithError(w, http.StatusBadGateway, "Plata este in curs de verificare. Reincearca.")
		return
	}
	router.RespondWithJSON(w, http.StatusOK, ReconcileCheckoutResponse{Status: status, OrderID: common.UUIDToString(order.ID)})
}

// Reconciliation, explicit cancellation and expiry all use the same provider
// state machine. A cancellation race can return succeeded; only a confirmed
// canceled PI authorizes release. Processing/errors retain inventory.
func (h *CheckoutHandler) reconcileNativePaymentIntent(ctx context.Context, order db.Orders, intent *stripe.PaymentIntent, expiresAt time.Time, cancelPayment bool) (string, error) {
	accountID := order.StripeConnectedAccountID.String
	if err := h.validateNativePaymentIntent(order, intent, accountID); err != nil {
		return "", err
	}
	if order.Status == db.OrderStatusCompleted || order.Status == db.OrderStatusRefunded {
		return string(order.Status), nil
	}
	if (cancelPayment || !time.Now().Before(expiresAt)) && intent.Status != stripe.PaymentIntentStatusSucceeded && intent.Status != stripe.PaymentIntentStatusCanceled {
		canceled, err := h.cancelNativePaymentIntent(ctx, intent.ID, accountID)
		if err != nil {
			// Confirmation may have won while Stripe handled Cancel. Retrieve the
			// authoritative final state, without guessing that a timeout canceled it.
			canceled, err = h.retrieveNativePaymentIntent(ctx, intent.ID, accountID)
		}
		if err != nil {
			return "", err
		}
		if err := h.validateNativePaymentIntent(order, canceled, accountID); err != nil {
			return "", err
		}
		intent = canceled
	}
	switch intent.Status {
	case stripe.PaymentIntentStatusSucceeded:
		if err := h.fulfillPaidOrder(ctx, "", intent.ID, common.UUIDToString(order.ID), accountID, intent.Livemode, intent); err != nil {
			return "", err
		}
	case stripe.PaymentIntentStatusCanceled:
		// Binding and provider state have been verified before this row-locked,
		// pending-only release; racing successful/duplicate callbacks cannot double
		// decrement stock or revoke tickets already committed.
		if err := h.failOrder(ctx, order.ID, intent.ID, accountID); err != nil {
			return "", err
		}
	}
	updated, err := h.queries.GetOrderForUpdate(ctx, order.ID)
	if err != nil {
		return "", err
	}
	if updated.StripeRefundNeedsAttention && updated.Status != db.OrderStatusCompleted && updated.Status != db.OrderStatusRefunded {
		return "failed", nil
	}
	return string(updated.Status), nil
}

// Only exact PIs persisted for a native order are accepted. Unknown and hosted
// payment_intent events are deliberately ignored; their Session remains the
// authority. No metadata lookup can bind a new PI here.
func (h *CheckoutHandler) reconcileNativePaymentEvent(ctx context.Context, intent stripe.PaymentIntent, accountID string, liveMode bool) error {
	if intent.ID == "" || accountID == "" || !h.acceptsStripeLiveMode(liveMode) || intent.Livemode != liveMode {
		return nil
	}
	order, err := h.queries.GetOrderByStripePaymentIntent(ctx, pgtype.Text{String: intent.ID, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if order.StripeCheckoutSessionID.Valid || !stripeOrderContextMatches(order, accountID) {
		return nil
	}
	_, expiresAt, err := h.nativePaymentOrder(ctx, order.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	_, err = h.reconcileNativePaymentIntent(ctx, order, &intent, expiresAt, false)
	return err
}
