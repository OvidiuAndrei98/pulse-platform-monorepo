package payments

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"log"
	"strings"
	"sync"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"
)

const checkoutReconciliationInterval = 15 * time.Second

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
		// Durable email worker handles delivery, including retries.
		return "completed", orderID, nil
	}
	if order.Status == db.OrderStatusRefunded {
		return string(order.Status), orderID, nil
	}
	if !order.StripeConnectedAccountID.Valid || strings.TrimSpace(order.StripeConnectedAccountID.String) == "" {
		return "", "", errors.New("comanda nu are contul Stripe conectat")
	}

	session, err := h.retrieveCheckoutSession(ctx, sessionID, order.StripeConnectedAccountID.String)
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
	if err := h.recordHostedPaymentAttempt(ctx, order, session.PaymentIntent, order.StripeConnectedAccountID.String); err != nil {
		return "", "", err
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
		updated, err := h.queries.GetOrderByCheckoutSession(ctx, pgtype.Text{String: sessionID, Valid: true})
		if err != nil {
			return "", "", err
		}
		if updated.Status == db.OrderStatusCompleted {
			return "completed", orderID, nil
		}
		// A paid Session can require a refund when an old release race cannot
		// restore capacity. Never show success without tickets, or claim failure
		// and invite a second charge while the first payment awaits resolution.
		if updated.StripeRefundNeedsAttention {
			return "pending", orderID, nil
		}
		return string(updated.Status), orderID, nil
	case stripe.CheckoutSessionStatusExpired:
		if err := h.ReleaseExpiredCheckout(ctx, *session, order.StripeConnectedAccountID.String); err != nil {
			return "", "", err
		}
		// Completion and expiry deliveries may race. Return the committed local
		// state after the row-locked transition instead of assuming expiry won.
		updated, err := h.queries.GetOrderByCheckoutSession(ctx, pgtype.Text{String: sessionID, Valid: true})
		if err != nil {
			return "", "", err
		}
		return string(updated.Status), orderID, nil
	default:
		if order.Status == db.OrderStatusFailed {
			return "failed", orderID, nil
		}
		return "pending", orderID, nil
	}
}

// StartCheckoutReconciliationWorker repairs direct-charge orders even when
// Stripe webhook delivery was temporarily unavailable.
func (h *CheckoutHandler) StartCheckoutReconciliationWorker(ctx context.Context) {
	if h == nil {
		return
	}

	go h.runTicketEmailWorker(ctx)
	go h.runInvoiceServiceFeeWorker(ctx)
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
	if h.configured {
		var workers sync.WaitGroup
		for range 3 {
			workers.Add(1)
			go func() {
				defer workers.Done()
				for range 20 {
					if ctx.Err() != nil {
						return
					}
					order, err := h.queries.ClaimCheckoutForReconciliation(ctx)
					if errors.Is(err, pgx.ErrNoRows) {
						return
					}
					if err != nil {
						log.Printf("checkout claim failed: %v", err)
						return
					}
					requestCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
					_, _, err = h.reconcileCheckoutSession(requestCtx, order.StripeCheckoutSessionID.String, "")
					cancel()
					if err != nil {
						log.Printf("checkout reconciliation failed: order=%s err=%v", common.UUIDToString(order.ID), err)
					}
				}
			}()
		}
		workers.Wait()
		h.reconcilePendingPaymentSheets(ctx)

		markedForReview, err := h.queries.MarkStaleSessionlessCheckoutReservationsForReview(ctx)
		if err != nil {
			log.Print("stale checkout reservation review marking failed")
		} else if markedForReview > 0 {
			log.Printf("sessionless checkout reservations marked for review: count=%d", markedForReview)
		}
	}

}

func (h *CheckoutHandler) runTicketEmailWorker(ctx context.Context) {
	if h.mailer == nil {
		return
	}
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		if ctx.Err() != nil {
			return
		}
		if h.deliverPendingTicketEmails(ctx) {
			continue
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (h *CheckoutHandler) deliverPendingTicketEmails(ctx context.Context) bool {
	if h.mailer == nil {
		return false
	}
	pendingEmails, err := h.queries.ListRecentCompletedOrdersWithPendingTicketEmail(ctx)
	if err != nil {
		log.Printf("pending ticket email reconciliation query failed: %v", err)
		return false
	}
	var workers sync.WaitGroup
	for worker := 0; worker < 4; worker++ {
		workers.Add(1)
		go func(worker int) {
			defer workers.Done()
			for i := worker; i < len(pendingEmails); i += 4 {
				if ctx.Err() != nil {
					return
				}
				if err := h.deliverTicketConfirmation(pendingEmails[i].ID); err != nil {
					log.Printf("pending ticket email delivery failed: order=%s err=%v", common.UUIDToString(pendingEmails[i].ID), err)
				}
			}
		}(worker)
	}
	workers.Wait()
	return len(pendingEmails) == 50
}
