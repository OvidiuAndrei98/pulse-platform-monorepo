-- +goose Up
ALTER TABLE orders
    ADD COLUMN stripe_livemode BOOLEAN;

-- Checkout Session IDs expose their environment in the legacy identifier. This
-- backfill is intentionally conservative: unknown or old non-Checkout payments
-- remain NULL and are not eligible for automatic fiscal documents.
UPDATE orders
SET stripe_livemode = CASE
    WHEN LEFT(stripe_checkout_session_id, 8) = 'cs_live_' THEN TRUE
    WHEN LEFT(stripe_checkout_session_id, 8) = 'cs_test_' THEN FALSE
    ELSE NULL
END;

COMMENT ON COLUMN orders.stripe_livemode IS
    'Stripe environment confirmed by Checkout Session and its signed webhook; NULL means unverified legacy payment.';

CREATE INDEX orders_live_completed_at_idx
    ON orders (completed_at, event_id)
    WHERE stripe_livemode IS TRUE AND status = 'completed';

-- +goose Down
DROP INDEX IF EXISTS orders_live_completed_at_idx;

ALTER TABLE orders
    DROP COLUMN IF EXISTS stripe_livemode;
