package payments

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stripe/stripe-go/v85"
	db "pulse-api/db/generated"
	"pulse-api/internal/common"
)

// Shared by full application-fee refunds and the separate invoicing component.
// The session lock survives transaction commits while Stripe is being called.
func (h *CheckoutHandler) lockApplicationFee(ctx context.Context, id pgtype.UUID) (*pgxpool.Conn, func(), error) {
	conn, err := h.db.Acquire(ctx)
	if err != nil {
		return nil, nil, err
	}
	key := "spottr-application-fee:" + common.UUIDToString(id)
	var locked bool
	err = conn.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtextextended($1,0))`, key).Scan(&locked)
	if err != nil || !locked {
		conn.Release()
		if err == nil {
			err = errors.New("application fee reconciliation already running")
		}
		return nil, nil, err
	}
	return conn, func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, err := conn.Exec(cleanup, `SELECT pg_advisory_unlock(hashtextextended($1,0))`, key); err != nil {
			_ = conn.Conn().Close(cleanup)
		}
		conn.Release()
	}, nil
}

// Legacy settlement only: new orders never include an invoicing fee. Keep
// reconciling fees on older orders so refunds and historical balances remain correct.
func (h *CheckoutHandler) runInvoiceServiceFeeWorker(ctx context.Context) {
	if !h.configured {
		return
	}
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		h.reconcileInvoiceServiceFees(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (h *CheckoutHandler) reconcileInvoiceServiceFees(ctx context.Context) {
	rows, err := h.db.Query(ctx, `SELECT id FROM orders WHERE invoice_service_fee_state IN ('held','refund_pending') AND stripe_livemode IS TRUE AND status IN ('completed','refunded') AND invoice_service_fee_next_attempt_at<=clock_timestamp() ORDER BY invoice_service_fee_next_attempt_at LIMIT 20`)
	if err != nil {
		if ctx.Err() == nil {
			log.Print("invoice service fee queue unavailable")
		}
		return
	}
	var ids []pgtype.UUID
	for rows.Next() {
		var id pgtype.UUID
		if err = rows.Scan(&id); err != nil {
			break
		}
		ids = append(ids, id)
	}
	rows.Close()
	for _, id := range ids {
		request, cancel := context.WithTimeout(ctx, 30*time.Second)
		err := h.reconcileInvoiceServiceFee(request, id)
		cancel()
		if err != nil && ctx.Err() == nil {
			log.Printf("invoice service fee reconciliation deferred: order=%s", common.UUIDToString(id))
		}
	}
}

func (h *CheckoutHandler) reconcileInvoiceServiceFee(ctx context.Context, id pgtype.UUID) error {
	conn, unlock, err := h.lockApplicationFee(ctx, id)
	if err != nil {
		return err
	}
	defer unlock()
	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	order, err := h.queries.WithTx(tx).GetOrderForUpdate(ctx, id)
	if err != nil {
		return err
	}
	if !order.StripeLivemode.Bool || order.InvoiceServiceFeeBani != 50 || (order.Status != db.OrderStatusCompleted && order.Status != db.OrderStatusRefunded) || (order.InvoiceServiceFeeState != "held" && order.InvoiceServiceFeeState != "refund_pending") {
		return nil
	}
	if _, err = tx.Exec(ctx, `UPDATE orders SET invoice_service_fee_next_attempt_at=clock_timestamp()+interval '1 minute' WHERE id=$1`, id); err != nil {
		return err
	}
	if order.InvoiceServiceFeeState == "held" {
		var status string
		var attempts int32
		var updated pgtype.Timestamptz
		err = tx.QueryRow(ctx, `SELECT status,attempt_count,updated_at FROM billing_invoices WHERE order_id=$1`, id).Scan(&status, &attempts, &updated)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if status == "issued" {
			_, err = tx.Exec(ctx, `UPDATE orders SET invoice_service_fee_state='earned' WHERE id=$1`, id)
			if err != nil {
				return err
			}
			return tx.Commit(ctx)
		}
		// Do not race an active provider request, including one claimed by another instance.
		if (status == "processing" || status == "dispatching") && time.Since(updated.Time) < 10*time.Minute {
			return tx.Commit(ctx)
		}
		var enabled bool
		err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM organizer_invoicing_settings s JOIN events e ON e.organizer_id=s.organizer_id WHERE e.id=$1 AND s.enabled)`, order.EventID).Scan(&enabled)
		if err != nil {
			return err
		}
		terminal := status == "needs_review" || attempts >= 8 || order.Status == db.OrderStatusRefunded
		if !terminal && enabled && status != "" {
			return tx.Commit(ctx)
		}
		if !terminal && time.Since(order.CompletedAt.Time) < 10*time.Minute {
			return tx.Commit(ctx)
		}
		// Refund even an ambiguous final provider failure rather than charging for
		// an unconfirmed service. Its invoice remains blocked against duplicate issue.
		_, err = tx.Exec(ctx, `UPDATE orders SET invoice_service_fee_state='refund_pending' WHERE id=$1`, id)
		if err != nil {
			return err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	return h.refundInvoiceServiceComponent(ctx, order, conn)
}

func (h *CheckoutHandler) refundInvoiceServiceComponent(ctx context.Context, order db.Orders, storage db.DBTX) error {
	if order.StripePaymentIntentID.String == "" || order.StripeConnectedAccountID.String == "" {
		return errors.New("missing invoice service payment binding")
	}
	intentParams := &stripe.PaymentIntentRetrieveParams{}
	intentParams.SetStripeAccount(order.StripeConnectedAccountID.String)
	intent, err := h.client.V1PaymentIntents.Retrieve(ctx, order.StripePaymentIntentID.String, intentParams)
	if err != nil {
		return err
	}
	if intent == nil || intent.ID != order.StripePaymentIntentID.String || !intent.Livemode || intent.LatestCharge == nil || intent.ApplicationFeeAmount != int64(order.PlatformFeeBani) {
		return errors.New("invalid invoice service payment binding")
	}
	chargeParams := &stripe.ChargeRetrieveParams{}
	chargeParams.SetStripeAccount(order.StripeConnectedAccountID.String)
	charge, err := h.client.V1Charges.Retrieve(ctx, intent.LatestCharge.ID, chargeParams)
	if err != nil {
		return err
	}
	if charge == nil || charge.ID != intent.LatestCharge.ID || charge.ApplicationFee == nil {
		return errors.New("application fee not yet available")
	}
	fee, err := h.client.V1ApplicationFees.Retrieve(ctx, charge.ApplicationFee.ID, nil)
	if err != nil {
		return err
	}
	if fee == nil || fee.Amount != int64(order.PlatformFeeBani) || fee.Currency != stripe.CurrencyRON || fee.Account == nil || fee.Account.ID != order.StripeConnectedAccountID.String || fee.Charge == nil || fee.Charge.ID != charge.ID {
		return errors.New("invalid application fee binding")
	}
	refundID := ""
	// Stripe idempotency keys can expire. Inspect persistent refund metadata too.
	if fee.AmountRefunded > 0 {
		for refund, listErr := range h.client.V1FeeRefunds.List(ctx, &stripe.FeeRefundListParams{ID: stripe.String(fee.ID)}).All(ctx) {
			if listErr != nil {
				return listErr
			}
			if refund.Metadata["spottr_invoice_service_order"] == common.UUIDToString(order.ID) {
				refundID = refund.ID
				break
			}
		}
	}
	if refundID == "" && fee.AmountRefunded < fee.Amount {
		remaining := min(int64(order.InvoiceServiceFeeBani), fee.Amount-fee.AmountRefunded)
		params := &stripe.FeeRefundCreateParams{ID: stripe.String(fee.ID), Amount: stripe.Int64(remaining)}
		params.SetIdempotencyKey("spottr-invoice-service-refund-" + common.UUIDToString(order.ID))
		params.AddMetadata("spottr_invoice_service_order", common.UUIDToString(order.ID))
		refund, err := h.client.V1FeeRefunds.Create(ctx, params)
		if err != nil {
			return err
		}
		if refund == nil || refund.Amount != remaining {
			return errors.New("invalid service fee refund")
		}
		refundID = refund.ID
		fee.AmountRefunded += refund.Amount
	}
	// If the complete application fee was already refunded, this component is
	// already returned too. Never return another 50 bani from the ticket fee.
	refunded := max(int64(order.InvoiceServiceFeeBani), fee.AmountRefunded)
	if fee.AmountRefunded == fee.Amount {
		refunded = fee.Amount
	}
	_, err = storage.Exec(ctx, `UPDATE orders SET invoice_service_fee_state='refunded',invoice_service_fee_refund_id=NULLIF($2,''),platform_fee_refunded_bani=GREATEST(platform_fee_refunded_bani,$3::INT),platform_fee_status=CASE WHEN $3::INT>=platform_fee_bani THEN 'refunded' ELSE platform_fee_status END WHERE id=$1 AND invoice_service_fee_state='refund_pending'`, order.ID, refundID, refunded)
	return err
}
