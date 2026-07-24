package payments

import (
	"io"
	"log"
	"net/http"

	"github.com/stripe/stripe-go/v85/webhook"
)

const maxWebhookBodyBytes = 1 << 20

type WebhookHandler struct {
	webhookSecret string
}

func NewWebhookHandler(webhookSecret string) *WebhookHandler {
	return &WebhookHandler{webhookSecret: webhookSecret}
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

	switch string(event.Type) {
	case "checkout.session.completed", "checkout.session.expired", "payment_intent.payment_failed":
		log.Printf("Stripe webhook received: id=%s type=%s account=%s", event.ID, event.Type, event.Account)
	default:
		log.Printf("Stripe webhook ignored: id=%s type=%s", event.ID, event.Type)
	}

	w.WriteHeader(http.StatusOK)
}
