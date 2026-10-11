package payments

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"

	"pulse-api/internal/common"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// Claims use the same persisted lease as hosted Checkout and SKIP LOCKED, so
// multiple API instances neither flood Stripe nor block each other's batches.
func (h *CheckoutHandler) reconcilePendingPaymentSheets(ctx context.Context) {
	var workers sync.WaitGroup
	for range 3 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for range 20 {
				if ctx.Err() != nil {
					return
				}
				var orderID pgtype.UUID
				err := h.db.QueryRow(ctx, `WITH candidate AS (
 SELECT o.id FROM orders o
 WHERE o.status='pending' AND o.stripe_refund_needs_attention IS FALSE
   AND o.stripe_checkout_session_id IS NULL AND o.stripe_payment_intent_id IS NOT NULL
   AND o.stripe_connected_account_id IS NOT NULL AND o.stripe_charge_type='direct'
   AND o.created_at <= clock_timestamp()-interval '15 seconds'
   AND o.checkout_reconcile_after <= clock_timestamp()
   AND EXISTS (SELECT 1 FROM native_payment_sheet_orders n WHERE n.order_id=o.id)
 ORDER BY o.checkout_reconcile_after,o.created_at LIMIT 1 FOR UPDATE SKIP LOCKED
)
UPDATE orders SET checkout_reconcile_after=clock_timestamp()+interval '2 minutes'
FROM candidate WHERE orders.id=candidate.id RETURNING orders.id`).Scan(&orderID)
				if errors.Is(err, pgx.ErrNoRows) {
					return
				}
				if err != nil {
					log.Print("native payment reconciliation claim failed")
					return
				}
				requestCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
				order, expiresAt, err := h.nativePaymentOrder(requestCtx, orderID)
				if err == nil {
					intent, retrieveErr := h.retrieveNativePaymentIntent(requestCtx, order.StripePaymentIntentID.String, order.StripeConnectedAccountID.String)
					err = retrieveErr
					if err == nil {
						_, err = h.reconcileNativePaymentIntent(requestCtx, order, intent, expiresAt, false)
					}
				}
				cancel()
				if err != nil {
					// Never log a PaymentIntent object/client secret or provider body.
					log.Printf("native payment reconciliation deferred: order=%s", common.UUIDToString(orderID))
				}
			}
		}()
	}
	workers.Wait()
}
