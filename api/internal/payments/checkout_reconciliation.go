package payments

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"
)

const checkoutReconciliationInterval = time.Minute

func (h *CheckoutHandler) reconcileCheckoutSession(ctx context.Context, sessionID, expectedEventID string) (string, string, error) {
	order, err := h.queries.GetOrderByCheckoutSession(ctx, pgtype.Text{String: sessionID, Valid: sessionID != ""})
	if err != nil {
		return "", "", err
	}
	orderID := common.UUIDToString(order.ID)
	if expectedEventID != "" && common.UUIDToString(order.EventID) != expectedEventID {
		return "", "", errors.New("evenimentul nu corespunde sesiunii de plata")
	}
	if order.Status == db.OrderStatusCompleted {
		h.queueInvoice(ctx, order.ID)
		if err := h.deliverTicketConfirmation(order.ID); err != nil {
			log.Printf("completed checkout still has pending email delivery: order=%s err=%v", orderID, err)
		}
		return "completed", orderID, nil
	}
	if order.Status == db.OrderStatusFailed || order.Status == db.OrderStatusRefunded {
		return string(order.Status), orderID, nil
	}
	if !order.StripeConnectedAccountID.Valid || strings.TrimSpace(order.StripeConnectedAccountID.String) == "" {
		return "", "", errors.New("comanda nu are contul Stripe conectat")
	}

	params := &stripe.CheckoutSessionRetrieveParams{}
	params.SetStripeAccount(order.StripeConnectedAccountID.String)
	session, err := h.client.V1CheckoutSessions.Retrieve(ctx, sessionID, params)
	if err != nil {
		return "", "", err
	}
	if session == nil || session.ID != sessionID {
		return "", "", errors.New("Stripe nu a returnat sesiunea solicitata")
	}
	if !h.acceptsStripeLiveMode(session.Livemode) {
		return "", "", errors.New("mediul Stripe nu corespunde configuratiei API")
	}
	if metadataOrderID := firstStripeMetadata(session.Metadata, "spottr_order_id", "pulse_order_id"); metadataOrderID != orderID {
		return "", "", errors.New("comanda Stripe nu corespunde sesiunii")
	}

	switch session.Status {
	case stripe.CheckoutSessionStatusComplete:
		if session.PaymentStatus != stripe.CheckoutSessionPaymentStatusPaid {
			return "pending", orderID, nil
		}
		paymentIntentID := ""
		if session.PaymentIntent != nil {
			paymentIntentID = session.PaymentIntent.ID
		}
		if err := h.FulfillCheckout(ctx, session.ID, paymentIntentID, orderID, order.StripeConnectedAccountID.String, session.Livemode); err != nil {
			// Fulfillment commits tickets before sending email. Treat the payment as
			// completed if only post-commit delivery failed; the worker will retry
			// delivery on its next idempotent pass.
			updated, lookupErr := h.queries.GetOrderByCheckoutSession(ctx, pgtype.Text{String: sessionID, Valid: true})
			if lookupErr == nil && updated.Status == db.OrderStatusCompleted {
				log.Printf("checkout completed with pending post-payment delivery: order=%s err=%v", orderID, err)
				return "completed", orderID, nil
			}
			return "", "", err
		}
		return "completed", orderID, nil
	case stripe.CheckoutSessionStatusExpired:
		if err := h.FailCheckout(ctx, orderID, "", order.StripeConnectedAccountID.String); err != nil {
			return "", "", err
		}
		return "failed", orderID, nil
	default:
		return "pending", orderID, nil
	}
}

// StartCheckoutReconciliationWorker repairs direct-charge orders even when
// Stripe webhook delivery was temporarily unavailable.
func (h *CheckoutHandler) StartCheckoutReconciliationWorker(ctx context.Context) {
	if h == nil || !h.configured {
		return
	}

	go func() {
		h.reconcilePendingCheckouts(ctx)
		ticker := time.NewTicker(checkoutReconciliationInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.reconcilePendingCheckouts(ctx)
			}
		}
	}()
}

func (h *CheckoutHandler) reconcilePendingCheckouts(ctx context.Context) {
	orders, err := h.queries.ListPendingDirectChargeCheckoutsForReconciliation(ctx)
	if err != nil {
		log.Printf("pending checkout reconciliation query failed: %v", err)
		return
	}
	for _, order := range orders {
		requestCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		status, _, reconcileErr := h.reconcileCheckoutSession(requestCtx, order.StripeCheckoutSessionID.String, "")
		cancel()
		if reconcileErr != nil {
			log.Printf("pending checkout reconciliation failed: order=%s", common.UUIDToString(order.ID))
			continue
		}
		if status != "pending" {
			log.Printf("pending checkout reconciled: order=%s status=%s", common.UUIDToString(order.ID), status)
		}
	}

	markedForReview, err := h.queries.MarkStaleSessionlessCheckoutReservationsForReview(ctx)
	if err != nil {
		log.Print("stale checkout reservation review marking failed")
		return
	}
	if markedForReview > 0 {
		log.Printf("sessionless checkout reservations marked for review: count=%d", markedForReview)
	}

	if h.mailer == nil {
		return
	}
	pendingEmails, err := h.queries.ListRecentCompletedOrdersWithPendingTicketEmail(ctx)
	if err != nil {
		log.Printf("pending ticket email reconciliation query failed: %v", err)
		return
	}
	for _, order := range pendingEmails {
		if err := h.deliverTicketConfirmation(order.ID); err != nil {
			log.Printf("pending ticket email reconciliation failed: order=%s err=%v", common.UUIDToString(order.ID), err)
		}
	}
}
