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
			if h.promotions == nil || h.promotions.FulfillCampaign(r.Context(), campaignID, session.ID, paymentIntentID) != nil {
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
				if err := h.promotions.CancelCampaign(r.Context(), campaignID); err != nil {
					http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
					return
				}
				break
			}
			if h.checkout == nil {
				break
			}
			orderID := firstStripeMetadata(session.Metadata, "spottr_order_id", "pulse_order_id")
			if err := h.checkout.FailCheckout(r.Context(), orderID, "", ""); err != nil {
				log.Printf("Stripe checkout release failed: session=%s err=%v", session.ID, err)
				http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
				return
			}
		}
		log.Printf("Stripe checkout expired: id=%s", event.ID)
	case "payment_intent.payment_failed":
		var paymentIntent stripe.PaymentIntent
		if event.Data != nil && json.Unmarshal(event.Data.Raw, &paymentIntent) == nil {
			if campaignID := paymentIntent.Metadata["pulse_promotion_campaign_id"]; campaignID != "" && h.promotions != nil {
				if err := h.promotions.CancelCampaign(r.Context(), campaignID); err != nil {
					http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
					return
				}
				break
			}
			if h.checkout == nil {
				break
			}
			orderID := firstStripeMetadata(paymentIntent.Metadata, "spottr_order_id", "pulse_order_id")
			if err := h.checkout.FailCheckout(r.Context(), orderID, paymentIntent.ID, ""); err != nil {
				log.Printf("Stripe payment failure release failed: payment_intent=%s err=%v", paymentIntent.ID, err)
				http.Error(w, "Webhook processing failed", http.StatusInternalServerError)
				return
			}
		}
		log.Printf("Stripe payment failed: id=%s", event.ID)
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
