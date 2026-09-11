-- +goose Up
ALTER TABLE orders
    ADD COLUMN platform_fee_status VARCHAR(24) NOT NULL DEFAULT 'earned',
    ADD COLUMN platform_fee_refunded_bani BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN refund_origin VARCHAR(24);

ALTER TABLE orders
    ADD CONSTRAINT orders_platform_fee_status_check
        CHECK (platform_fee_status IN ('earned', 'refund_pending', 'refunded', 'needs_review')),
    ADD CONSTRAINT orders_platform_fee_refunded_check
        CHECK (platform_fee_refunded_bani >= 0 AND platform_fee_refunded_bani <= platform_fee_bani),
    ADD CONSTRAINT orders_refund_origin_check
        CHECK (refund_origin IS NULL OR refund_origin IN ('event_cancellation', 'stripe_dashboard'));

CREATE TABLE event_cancellation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    previous_event_status VARCHAR(24) NOT NULL,
    previous_publish_at TIMESTAMPTZ,
    previous_is_live BOOLEAN NOT NULL DEFAULT FALSE,
    reason TEXT NOT NULL,
    evidence_url TEXT,
    status VARCHAR(24) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'refunding', 'completed', 'rejected', 'failed')),
    fee_policy VARCHAR(16)
        CHECK (fee_policy IS NULL OR fee_policy IN ('retain', 'refund')),
    admin_note TEXT,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX event_cancellation_requests_active_idx
    ON event_cancellation_requests (event_id)
    WHERE status IN ('pending', 'refunding', 'failed');

CREATE INDEX event_cancellation_requests_admin_idx
    ON event_cancellation_requests (status, created_at DESC);

CREATE TABLE order_refund_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    cancellation_request_id UUID REFERENCES event_cancellation_requests(id) ON DELETE RESTRICT,
    source VARCHAR(24) NOT NULL
        CHECK (source IN ('event_cancellation', 'stripe_dashboard')),
    fee_policy VARCHAR(16) NOT NULL
        CHECK (fee_policy IN ('retain', 'refund', 'review')),
    status VARCHAR(24) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'stripe_pending', 'succeeded', 'failed', 'needs_review')),
    stripe_refund_id VARCHAR(255),
    stripe_application_fee_id VARCHAR(255),
    stripe_fee_refund_id VARCHAR(255),
    refund_amount_bani BIGINT NOT NULL DEFAULT 0,
    application_fee_refunded_bani BIGINT NOT NULL DEFAULT 0,
    attempt_count INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX order_refund_operations_stripe_refund_idx
    ON order_refund_operations (stripe_refund_id)
    WHERE stripe_refund_id IS NOT NULL;

CREATE INDEX order_refund_operations_worker_idx
    ON order_refund_operations (status, next_attempt_at, created_at)
    WHERE status IN ('pending', 'failed', 'processing', 'stripe_pending');

-- Bring refunds that happened before this workflow under the same ledger.
-- Full live refunds return the Application Fee; partial refunds are held out
-- of commission invoicing until an administrator reviews them.
INSERT INTO order_refund_operations (
    order_id, source, fee_policy, status, refund_amount_bani
)
SELECT id, 'stripe_dashboard',
       CASE WHEN status = 'refunded' THEN 'refund' ELSE 'review' END,
       CASE WHEN status = 'refunded' THEN 'pending' ELSE 'needs_review' END,
       stripe_amount_refunded_bani
FROM orders
WHERE stripe_livemode IS TRUE
  AND stripe_amount_refunded_bani > 0
  AND status IN ('completed', 'refunded')
ON CONFLICT (order_id) DO NOTHING;

UPDATE orders
SET platform_fee_status = CASE WHEN status = 'refunded' THEN 'refund_pending' ELSE 'needs_review' END,
    refund_origin = 'stripe_dashboard',
    stripe_refund_needs_attention = (status <> 'refunded')
WHERE stripe_livemode IS TRUE
  AND stripe_amount_refunded_bani > 0
  AND status IN ('completed', 'refunded');

-- +goose Down
DROP INDEX IF EXISTS order_refund_operations_worker_idx;
DROP INDEX IF EXISTS order_refund_operations_stripe_refund_idx;
DROP TABLE IF EXISTS order_refund_operations;
DROP INDEX IF EXISTS event_cancellation_requests_admin_idx;
DROP INDEX IF EXISTS event_cancellation_requests_active_idx;
DROP TABLE IF EXISTS event_cancellation_requests;

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_refund_origin_check,
    DROP CONSTRAINT IF EXISTS orders_platform_fee_refunded_check,
    DROP CONSTRAINT IF EXISTS orders_platform_fee_status_check,
    DROP COLUMN IF EXISTS refund_origin,
    DROP COLUMN IF EXISTS platform_fee_refunded_bani,
    DROP COLUMN IF EXISTS platform_fee_status;
