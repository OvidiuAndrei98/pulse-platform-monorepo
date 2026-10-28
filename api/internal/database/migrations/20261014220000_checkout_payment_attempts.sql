-- +goose Up
-- A reservation / Stripe form is not a customer-visible transaction. Only
-- authoritative Stripe evidence of submission creates this marker.
CREATE TABLE checkout_payment_attempts (
    order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    attempted_at timestamptz NOT NULL DEFAULT now()
);

-- Existing completed purchases remain visible; do not infer an attempt from
-- a PaymentIntent ID, pending reservation, invoice request or local expiry.
INSERT INTO checkout_payment_attempts (order_id, attempted_at)
SELECT id, COALESCE(completed_at, created_at) FROM orders
WHERE status IN ('completed', 'refunded');

-- +goose Down
DROP TABLE checkout_payment_attempts;
