-- +goose Up

-- Shared counters keep abuse controls consistent across every ECS task. Only
-- HMAC digests are stored; client IPs, emails, and reset/session tokens never
-- appear in this table in plaintext.
CREATE TABLE request_rate_limits (
    scope VARCHAR(64) NOT NULL,
    subject_hash BYTEA NOT NULL,
    attempt_count INTEGER NOT NULL CHECK (attempt_count > 0),
    window_end TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (scope, subject_hash)
);

CREATE INDEX request_rate_limits_expiry_idx
    ON request_rate_limits(window_end);

ALTER TABLE orders
    ADD COLUMN reservation_ip_hash BYTEA;

CREATE INDEX orders_pending_checkout_identity_idx
    ON orders(event_id, user_id, created_at)
    WHERE status = 'pending';

CREATE INDEX orders_pending_checkout_guest_email_idx
    ON orders(event_id, lower(email), created_at)
    WHERE status = 'pending' AND user_id IS NULL;

CREATE INDEX orders_pending_checkout_ip_idx
    ON orders(event_id, reservation_ip_hash, created_at)
    WHERE status = 'pending' AND reservation_ip_hash IS NOT NULL;

-- A sessionless order can mean the process stopped around Stripe session
-- creation. Age alone cannot prove that no payment completed, so these rows
-- are quarantined for reconciliation instead of releasing inventory.
CREATE TABLE checkout_reservation_reviews (
    order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    reason VARCHAR(64) NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX checkout_reservation_reviews_open_idx
    ON checkout_reservation_reviews(detected_at)
    WHERE resolved_at IS NULL;

-- +goose Down

DROP INDEX IF EXISTS checkout_reservation_reviews_open_idx;
DROP TABLE IF EXISTS checkout_reservation_reviews;
DROP INDEX IF EXISTS orders_pending_checkout_ip_idx;
DROP INDEX IF EXISTS orders_pending_checkout_guest_email_idx;
DROP INDEX IF EXISTS orders_pending_checkout_identity_idx;
ALTER TABLE orders DROP COLUMN IF EXISTS reservation_ip_hash;
DROP TABLE IF EXISTS request_rate_limits;
