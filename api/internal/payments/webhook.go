package payments

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"pulse-api/internal/promotions"

	"github.com/stripe/stripe-go/v85"
	"github.com/stripe/stripe-go/v85/webhook"
)

const maxWebhookBodyBytes = 1 << 20

type WebhookHandler struct {
	webhookSecret string
	checkout      *CheckoutHandler
	promotions    *promotions.Handler
}

func NewWebhookHandler(webhookSecret string, checkout *CheckoutHandler, promotionHandler *promotions.Handler) *WebhookHandler {
	return &WebhookHandler{webhookSecret: webhookSecret, checkout: checkout, promotions: promotionHandler}
}

func (h *WebhookHandler) HandleStripeWebhook(w http.ResponseWriter, r *http.Request) {
	if h.webhookSecret == "" {
		log.Print("Stripe webhook received without STRIPE_WEBHOOK_SECRET configured")
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
		log.Printf("Stripe webhook signature verification failed: %v", err)
		http.Error(w, "Invalid webhook signature", http.StatusBadRequest)
		return
	}
	if h.checkout != nil && !h.checkout.acceptsStripeLiveMode(event.Livemode) {
		log.Printf("Stripe webhook ignored because its mode does not match the configured API key: id=%s livemode=%t", event.ID, event.Livemode)
		w.WriteHeader(http.StatusOK)
		return
	}

	switch string(event.Type) {
	case "payment_intent.succeeded", "payment_intent.canceled", "payment_intent.processing", "payment_intent.requires_action", "payment_intent.payment_failed":
		var intent stripe.PaymentIntent
		if event.Data == nil || json.Unmarshal(event.Data.Raw, &intent) != nil {
			http.Error(w, "Invalid PaymentIntent", http.StatusBadRequest)
			return
		}
		if h.checkout == nil {
			http.Error(w, "Checkout is not configured", http.StatusServiceUnavailable)
			return
		}
		if err := h.checkout.reconcileNativePaymentEvent(r.Context(), intent, event.Account, event.Livemode); err != nil {
			log.Printf("native payment webhook reconciliation failed: event=%s", event.ID)
			http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
			return
		}
	case "checkout.session.completed":
		var session stripe.CheckoutSession
		if event.Data == nil || json.Unmarshal(event.Data.Raw, &session) != nil {
			http.Error(w, "Invalid Checkout Session", http.StatusBadRequest)
			return
		}
		if session.PaymentStatus != stripe.CheckoutSessionPaymentStatusPaid {
			log.Printf("Stripe checkout is not paid yet: session=%s status=%s", session.ID, session.PaymentStatus)
			break
		}
		if h.checkout == nil {
			http.Error(w, "Checkout is not configured", http.StatusServiceUnavailable)
			return
		}
		paymentIntentID := ""
		if session.PaymentIntent != nil {
			paymentIntentID = session.PaymentIntent.ID
		}
		if campaignID := session.Metadata["pulse_promotion_campaign_id"]; campaignID != "" {
			if h.promotions == nil || h.promotions.FulfillCampaign(r.Context(), campaignID, session.ID, paymentIntentID, event.Livemode) != nil {
				log.Printf("Stripe promotion fulfillment failed: session=%s campaign=%s", session.ID, campaignID)
				http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
				return
			}
			log.Printf("Stripe promotion fulfilled: session=%s campaign=%s", session.ID, campaignID)
			break
		}
		orderID := firstStripeMetadata(session.Metadata, "spottr_order_id", "pulse_order_id")
		if err := h.checkout.FulfillCheckout(r.Context(), session.ID, paymentIntentID, orderID, "", event.Livemode); err != nil {
			log.Printf("Stripe checkout fulfillment failed: session=%s err=%v", session.ID, err)
			http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
			return
		}
		log.Printf("Stripe checkout fulfilled: session=%s", session.ID)
	case "checkout.session.expired":
		var session stripe.CheckoutSession
		if event.Data != nil && json.Unmarshal(event.Data.Raw, &session) == nil {
			if campaignID := session.Metadata["pulse_promotion_campaign_id"]; campaignID != "" && h.promotions != nil {
				if err := h.promotions.CancelCampaign(r.Context(), campaignID, session.ID); err != nil {
					http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
					return
				}
				break
			}
			if h.checkout == nil {
				break
			}
			if err := h.checkout.ReleaseExpiredCheckout(r.Context(), session, ""); err != nil {
				log.Printf("Stripe checkout release failed: session=%s err=%v", session.ID, err)
				http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
				return
			}
		}
		log.Printf("Stripe checkout expired: id=%s", event.ID)
	case "charge.refunded":
		var charge stripe.Charge
		if event.Data == nil || json.Unmarshal(event.Data.Raw, &charge) != nil {
			http.Error(w, "Invalid refunded Charge", http.StatusBadRequest)
			return
		}
		if h.promotions != nil {
			handled, promotionErr := h.promotions.RecordChargeRefund(r.Context(), charge, event.Livemode)
			if promotionErr != nil {
				log.Printf("Stripe promotion refund reconciliation failed: charge=%s err=%v", charge.ID, promotionErr)
				http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
				return
			}
			if handled {
				log.Printf("Stripe promotion refund reconciled: charge=%s", charge.ID)
				break
			}
		}
		if h.checkout == nil {
			http.Error(w, "Checkout is not configured", http.StatusServiceUnavailable)
			return
		}
		if err := h.checkout.ReconcileChargeRefund(r.Context(), charge, event.Account, event.Livemode); err != nil {
			log.Printf("Stripe refund reconciliation failed: charge=%s account=%s err=%v", charge.ID, event.Account, err)
			http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
			return
		}
		log.Printf("Stripe refund reconciled: charge=%s account=%s", charge.ID, event.Account)
	case "refund.created", "refund.updated", "refund.failed":
		var refund stripe.Refund
		if event.Data == nil || json.Unmarshal(event.Data.Raw, &refund) != nil {
			http.Error(w, "Invalid Refund", http.StatusBadRequest)
			return
		}
		if h.promotions != nil {
			handled, promotionErr := h.promotions.RecordRefund(r.Context(), refund, event.Livemode)
			if promotionErr != nil {
				log.Printf("Stripe promotion refund status update failed: refund=%s err=%v", refund.ID, promotionErr)
				http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
				return
			}
			if handled {
				log.Printf("Stripe promotion refund status updated: refund=%s", refund.ID)
				break
			}
		}
		if h.checkout == nil {
			http.Error(w, "Checkout is not configured", http.StatusServiceUnavailable)
			return
		}
		if err := h.checkout.RecordRefundEvent(r.Context(), refund, event.Account, event.Livemode); err != nil {
			log.Printf("Stripe refund status update failed: refund=%s account=%s err=%v", refund.ID, event.Account, err)
			http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
			return
		}
	default:
		log.Printf("Stripe webhook ignored: id=%s type=%s", event.ID, event.Type)
	}

	w.WriteHeader(http.StatusOK)
}

func firstStripeMetadata(metadata map[string]string, keys ...string) string {
	for _, key := range keys {
		if value := metadata[key]; value != "" {
			return value
		}
	}
	return ""
}
