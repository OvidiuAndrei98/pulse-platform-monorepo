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
}

func NewConnectWebhookHandler(queries *db.Queries, webhookSecret string) *ConnectWebhookHandler {
	return &ConnectWebhookHandler{queries: queries, webhookSecret: webhookSecret}
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
