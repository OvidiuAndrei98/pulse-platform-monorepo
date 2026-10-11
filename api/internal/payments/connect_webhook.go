package payments

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"
	"github.com/stripe/stripe-go/v85/webhook"

	db "pulse-api/db/generated"
)

type ConnectWebhookHandler struct {
	queries       *db.Queries
	webhookSecret string
	checkout      *CheckoutHandler
}

func NewConnectWebhookHandler(queries *db.Queries, webhookSecret string, checkout *CheckoutHandler) *ConnectWebhookHandler {
	return &ConnectWebhookHandler{queries: queries, webhookSecret: webhookSecret, checkout: checkout}
}

func (h *ConnectWebhookHandler) HandleStripeConnectWebhook(w http.ResponseWriter, r *http.Request) {
	if h.webhookSecret == "" {
		log.Print("Stripe Connect webhook received without STRIPE_CONNECT_WEBHOOK_SECRET configured")
		http.Error(w, "Webhook is not configured", http.StatusServiceUnavailable)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxWebhookBodyBytes)
	payload, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Invalid webhook payload", http.StatusBadRequest)
		return
	}
	event, err := webhook.ConstructEventWithOptions(
		payload,
		r.Header.Get("Stripe-Signature"),
		h.webhookSecret,
		webhook.ConstructEventOptions{IgnoreAPIVersionMismatch: true},
	)
	if err != nil {
		log.Printf("Stripe Connect webhook signature verification failed: %v", err)
		http.Error(w, "Invalid webhook signature", http.StatusBadRequest)
		return
	}
	if h.checkout != nil && !h.checkout.acceptsStripeLiveMode(event.Livemode) {
		log.Printf("Stripe Connect webhook ignored because its mode does not match the configured API key: id=%s livemode=%t", event.ID, event.Livemode)
		w.WriteHeader(http.StatusOK)
		return
	}

	if handled, processingErr := h.handleDirectChargeEvent(r, event); handled {
		if processingErr != nil {
			log.Printf("Stripe direct-charge webhook processing failed: id=%s account=%s err=%v", event.ID, event.Account, processingErr)
			http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		return
	}

	if string(event.Type) == "account.application.deauthorized" && event.Account != "" {
		_, err = h.queries.ClearOrganizerStripeAccount(r.Context(), pgtype.Text{String: event.Account, Valid: true})
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			log.Printf("Stripe Connect deauthorization cleanup failed: account=%s err=%v", event.Account, err)
			http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
			return
		}
		log.Printf("Stripe Connect account deauthorized: account=%s", event.Account)
		w.WriteHeader(http.StatusOK)
		return
	}

	if string(event.Type) != "account.updated" {
		log.Printf("Stripe Connect webhook ignored: id=%s type=%s", event.ID, event.Type)
		w.WriteHeader(http.StatusOK)
		return
	}

	var account stripe.Account
	if event.Data == nil || json.Unmarshal(event.Data.Raw, &account) != nil || account.ID == "" {
		log.Printf("Stripe Connect account event could not be decoded: id=%s", event.ID)
		w.WriteHeader(http.StatusOK)
		return
	}
	if account.Deleted {
		_, err = h.queries.ClearOrganizerStripeAccount(r.Context(), pgtype.Text{String: account.ID, Valid: true})
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			log.Printf("Stripe Connect deleted account cleanup failed: account=%s err=%v", account.ID, err)
			http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
			return
		}
		log.Printf("Stripe Connect account deleted: account=%s", account.ID)
		w.WriteHeader(http.StatusOK)
		return
	}

	_, err = h.queries.UpdateOrganizerStripeAccountStatus(r.Context(), db.UpdateOrganizerStripeAccountStatusParams{
		StripeAccountID:        pgtype.Text{String: account.ID, Valid: true},
		StripeChargesEnabled:   account.ChargesEnabled,
		StripePayoutsEnabled:   account.PayoutsEnabled,
		StripeDetailsSubmitted: account.DetailsSubmitted,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			log.Printf("Stripe Connect account is not associated with Spottr: account=%s", account.ID)
			w.WriteHeader(http.StatusOK)
			return
		}

		log.Printf("Stripe Connect account status update failed: account=%s err=%v", account.ID, err)
		http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
		return
	}

	log.Printf("Stripe Connect account updated: account=%s charges_enabled=%t payouts_enabled=%t", account.ID, account.ChargesEnabled, account.PayoutsEnabled)
	w.WriteHeader(http.StatusOK)
}

func (h *ConnectWebhookHandler) handleDirectChargeEvent(r *http.Request, event stripe.Event) (bool, error) {
	switch string(event.Type) {
	case "payment_intent.succeeded", "payment_intent.canceled":
		var intent stripe.PaymentIntent
		if event.Data == nil || json.Unmarshal(event.Data.Raw, &intent) != nil {
			return true, errors.New("invalid native PaymentIntent")
		}
		if h.checkout == nil {
			return true, errors.New("checkout handler is missing")
		}
		return true, h.checkout.reconcileNativePaymentEvent(r.Context(), intent, event.Account, event.Livemode)
	case "checkout.session.completed":
		var session stripe.CheckoutSession
		if event.Data == nil || json.Unmarshal(event.Data.Raw, &session) != nil {
			return true, errors.New("invalid Checkout Session")
		}
		orderID := firstStripeMetadata(session.Metadata, "spottr_order_id", "pulse_order_id")
		if orderID == "" {
			return false, nil
		}
		if h.checkout == nil || event.Account == "" {
			return true, errors.New("direct checkout handler or connected account is missing")
		}
		if session.PaymentStatus != stripe.CheckoutSessionPaymentStatusPaid {
			log.Printf("Stripe direct checkout is not paid yet: session=%s account=%s status=%s", session.ID, event.Account, session.PaymentStatus)
			return true, nil
		}
		paymentIntentID := ""
		if session.PaymentIntent != nil {
			paymentIntentID = session.PaymentIntent.ID
		}
		if err := h.checkout.FulfillCheckout(r.Context(), session.ID, paymentIntentID, orderID, event.Account, event.Livemode); err != nil {
			return true, err
		}
		log.Printf("Stripe direct checkout fulfilled: session=%s account=%s", session.ID, event.Account)
		return true, nil

	case "checkout.session.expired":
		var session stripe.CheckoutSession
		if event.Data == nil || json.Unmarshal(event.Data.Raw, &session) != nil {
			return true, errors.New("invalid expired Checkout Session")
		}
		if h.checkout == nil || event.Account == "" {
			return true, errors.New("direct checkout handler or connected account is missing")
		}
		return true, h.checkout.ReleaseExpiredCheckout(r.Context(), session, event.Account)

	case "payment_intent.payment_failed":
		var paymentIntent stripe.PaymentIntent
		if event.Data == nil || json.Unmarshal(event.Data.Raw, &paymentIntent) != nil {
			return true, errors.New("invalid failed PaymentIntent")
		}
		// A failed PaymentIntent is only a failed attempt. Checkout can attach a
		// new payment method and later complete the same Session successfully.
		log.Printf("Stripe direct payment attempt failed (reservation retained): payment_intent=%s account=%s", paymentIntent.ID, event.Account)
		return true, nil

	case "charge.refunded":
		var charge stripe.Charge
		if event.Data == nil || json.Unmarshal(event.Data.Raw, &charge) != nil {
			return true, errors.New("invalid refunded Charge")
		}
		if h.checkout == nil || event.Account == "" {
			return true, errors.New("direct refund handler or connected account is missing")
		}
		if err := h.checkout.ReconcileChargeRefund(r.Context(), charge, event.Account, event.Livemode); err != nil {
			return true, err
		}
		log.Printf("Stripe direct refund reconciled: charge=%s account=%s", charge.ID, event.Account)
		return true, nil

	case "refund.created", "refund.updated", "refund.failed":
		var refund stripe.Refund
		if event.Data == nil || json.Unmarshal(event.Data.Raw, &refund) != nil {
			return true, errors.New("invalid Refund")
		}
		if h.checkout == nil || event.Account == "" {
			return true, errors.New("direct refund handler or connected account is missing")
		}
		return true, h.checkout.RecordRefundEvent(r.Context(), refund, event.Account, event.Livemode)
	default:
		return false, nil
	}
}
