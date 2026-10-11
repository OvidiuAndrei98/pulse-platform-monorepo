-- +goose Up
-- A server-written marker is required in addition to a PaymentIntent ID: Stripe
-- metadata alone must never turn a hosted/foreign payment into a native order.
CREATE TABLE native_payment_sheet_orders (
    order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX orders_native_payment_reconcile_due_idx
    ON orders (checkout_reconcile_after, created_at)
    WHERE status = 'pending' AND stripe_refund_needs_attention IS FALSE
      AND stripe_checkout_session_id IS NULL AND stripe_payment_intent_id IS NOT NULL
      AND stripe_connected_account_id IS NOT NULL AND stripe_charge_type = 'direct';

-- +goose Down
DROP INDEX orders_native_payment_reconcile_due_idx;
DROP TABLE native_payment_sheet_orders;
