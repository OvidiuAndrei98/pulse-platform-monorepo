package promotions

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"

	"pulse-api/internal/common"
	"pulse-api/internal/router"
)

// A return URL never proves payment. Fetch the stored, owner-scoped Stripe
// session and use the same atomic fulfillment path as the signed webhook.
func (h *Handler) HandleReconcileCheckout(w http.ResponseWriter, r *http.Request) {
	organizerID, ok := authenticatedUserID(r.Context())
	if !ok {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}
	var campaignID pgtype.UUID
	if campaignID.Scan(chi.URLParam(r, "id")) != nil || !campaignID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "Campanie invalida")
		return
	}
	if !h.configured || h.pool == nil {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Platile Stripe nu sunt configurate")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	var status string
	var sessionID pgtype.Text
	var liveMode pgtype.Bool
	var amount int64
	checkoutURL := ""
	err := h.pool.QueryRow(ctx, `SELECT status::text, stripe_checkout_session_id, stripe_livemode, amount_bani
FROM promotion_campaigns WHERE id=$1 AND organizer_id=$2`, campaignID, organizerID).Scan(&status, &sessionID, &liveMode, &amount)
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusNotFound, "Promovarea nu a fost gasita")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Promovarea nu a putut fi verificata")
		return
	}
	if status == "pending_payment" && sessionID.Valid && sessionID.String != "" {
		session, err := h.client.V1CheckoutSessions.Retrieve(ctx, sessionID.String, nil)
		if err != nil || !validCampaignCheckout(session, common.UUIDToString(campaignID), sessionID.String, amount, liveMode) {
			router.RespondWithError(w, http.StatusBadGateway, "Plata promovarii nu a putut fi verificata")
			return
		}
		if session.Status == stripe.CheckoutSessionStatusOpen {
			checkoutURL = session.URL
		}
		switch {
		case session.Status == stripe.CheckoutSessionStatusComplete && session.PaymentStatus == stripe.CheckoutSessionPaymentStatusPaid:
			intentID := ""
			if session.PaymentIntent != nil {
				intentID = session.PaymentIntent.ID
			}
			err = h.FulfillCampaign(ctx, common.UUIDToString(campaignID), session.ID, intentID, session.Livemode)
		case session.Status == stripe.CheckoutSessionStatusExpired:
			err = h.CancelCampaign(ctx, common.UUIDToString(campaignID), session.ID)
		}
		if err != nil {
			router.RespondWithError(w, http.StatusBadGateway, "Plata promovarii necesita reverificare")
			return
		}
	}
	// Re-read after the transaction (and any concurrent webhook/refund).
	if err := h.pool.QueryRow(ctx, `SELECT status::text FROM promotion_campaigns WHERE id=$1 AND organizer_id=$2`, campaignID, organizerID).Scan(&status); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Promovarea nu a putut fi verificata")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	response := map[string]string{"campaignId": common.UUIDToString(campaignID), "status": status}
	if status == "pending_payment" && checkoutURL != "" {
		response["checkoutUrl"] = checkoutURL
	}
	router.RespondWithJSON(w, http.StatusOK, response)
}

func validCampaignCheckout(session *stripe.CheckoutSession, campaignID, sessionID string, amount int64, liveMode pgtype.Bool) bool {
	return session != nil && session.ID == sessionID &&
		session.Metadata["pulse_promotion_campaign_id"] == campaignID &&
		session.Mode == stripe.CheckoutSessionModePayment && session.Currency == stripe.CurrencyRON &&
		session.AmountTotal == amount && liveMode.Valid && liveMode.Bool == session.Livemode
}
