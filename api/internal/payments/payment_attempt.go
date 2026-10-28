package payments

import (
	"context"
	"errors"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"
)

// Creation, collecting card details and cancelling an untouched form do not
// establish submission. A declined attempt is still an attempt, never a sale.
func paymentWasAttempted(intent *stripe.PaymentIntent) bool {
	if intent == nil {
		return false
	}
	if intent.LastPaymentError != nil || (intent.LatestCharge != nil && intent.LatestCharge.ID != "") {
		return true
	}
	switch intent.Status {
	case stripe.PaymentIntentStatusRequiresAction, stripe.PaymentIntentStatusProcessing,
		stripe.PaymentIntentStatusRequiresCapture, stripe.PaymentIntentStatusSucceeded:
		return true
	}
	return false
}

func (h *CheckoutHandler) recordPaymentAttempt(ctx context.Context, orderID pgtype.UUID) error {
	_, err := h.db.Exec(ctx, `INSERT INTO checkout_payment_attempts(order_id) VALUES($1) ON CONFLICT DO NOTHING`, orderID)
	return err
}

// Caller must first verify the exact server-created Checkout Session or the
// immutable stored PI binding. Metadata alone is never sufficient.
func (h *CheckoutHandler) recordHostedPaymentAttempt(ctx context.Context, order db.Orders, intent *stripe.PaymentIntent, accountID string) error {
	if !paymentWasAttempted(intent) || intent.ID == "" || !order.StripeCheckoutSessionID.Valid ||
		!stripeOrderContextMatches(order, accountID) || !h.acceptsStripeLiveMode(intent.Livemode) ||
		(order.StripeLivemode.Valid && order.StripeLivemode.Bool != intent.Livemode) ||
		(order.StripePaymentIntentID.Valid && order.StripePaymentIntentID.String != intent.ID) ||
		intent.Amount != int64(order.TotalAmount)*100+int64(order.CustomerTicketingFeeBani) ||
		intent.Currency != stripe.CurrencyRON || intent.ApplicationFeeAmount != int64(order.PlatformFeeBani) ||
		firstStripeMetadata(intent.Metadata, "spottr_order_id", "pulse_order_id") != common.UUIDToString(order.ID) {
		return nil
	}
	return h.recordPaymentAttempt(ctx, order.ID)
}

// Hosted Checkout can create its PI only when Pay is pressed, so it may not yet
// be bound locally when the first submission event arrives. Metadata locates a
// candidate only; a provider lookup of our immutable Session proves the binding.
// This never changes the order's PI or fulfills a purchase from metadata.
func (h *CheckoutHandler) recordUnboundHostedPaymentAttempt(ctx context.Context, intent *stripe.PaymentIntent, accountID string) error {
	if !paymentWasAttempted(intent) {
		return nil
	}
	var orderID pgtype.UUID
	if orderID.Scan(firstStripeMetadata(intent.Metadata, "spottr_order_id", "pulse_order_id")) != nil || !orderID.Valid {
		return nil
	}
	order, err := h.queries.GetOrderForUpdate(ctx, orderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if !order.StripeCheckoutSessionID.Valid || order.StripeCheckoutSessionID.String == "" || !stripeOrderContextMatches(order, accountID) {
		return nil
	}
	session, err := h.retrieveCheckoutSession(ctx, order.StripeCheckoutSessionID.String, accountID)
	if err != nil {
		return err
	}
	if session == nil || session.ID != order.StripeCheckoutSessionID.String || session.Livemode != intent.Livemode ||
		firstStripeMetadata(session.Metadata, "spottr_order_id", "pulse_order_id") != common.UUIDToString(order.ID) ||
		session.PaymentIntent == nil || session.PaymentIntent.ID != intent.ID {
		return nil
	}
	return h.recordHostedPaymentAttempt(ctx, order, intent, accountID)
}
