-- +goose Up
ALTER TABLE orders
    ADD COLUMN stripe_charge_id VARCHAR(255),
    ADD COLUMN stripe_amount_refunded_bani BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN stripe_refund_status VARCHAR(24) NOT NULL DEFAULT 'none',
    ADD COLUMN stripe_refund_needs_attention BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN stripe_refund_updated_at TIMESTAMPTZ,
    ADD COLUMN automatic_invoice_refund_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Invoices for orders that predate this migration may already have been
-- reversed manually. Reconcile their Stripe/order state without risking a
-- duplicate fiscal document. All newly created orders use the TRUE default.
UPDATE orders
SET automatic_invoice_refund_enabled = FALSE;

ALTER TABLE orders
    ADD CONSTRAINT orders_stripe_amount_refunded_check
        CHECK (stripe_amount_refunded_bani >= 0),
    ADD CONSTRAINT orders_stripe_refund_status_check
        CHECK (stripe_refund_status IN ('none', 'pending', 'partial', 'succeeded', 'failed', 'requires_action'));

CREATE UNIQUE INDEX orders_stripe_charge_id_idx
    ON orders (stripe_charge_id)
    WHERE stripe_charge_id IS NOT NULL;

CREATE TABLE billing_invoice_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_invoice_id UUID NOT NULL UNIQUE REFERENCES billing_invoices(id) ON DELETE CASCADE,
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('oblio', 'smartbill')),
    status VARCHAR(24) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'issued', 'failed', 'needs_review')),
    attempt_count INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    external_series VARCHAR(64),
    external_number VARCHAR(64),
    external_document_id VARCHAR(128),
    document_url TEXT,
    error_message TEXT,
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX billing_invoice_refunds_processing_idx
    ON billing_invoice_refunds (status, next_attempt_at, created_at)
    WHERE status IN ('pending', 'failed', 'processing');

-- +goose Down
DROP INDEX IF EXISTS billing_invoice_refunds_processing_idx;
DROP TABLE IF EXISTS billing_invoice_refunds;

DROP INDEX IF EXISTS orders_stripe_charge_id_idx;
ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_stripe_refund_status_check,
    DROP CONSTRAINT IF EXISTS orders_stripe_amount_refunded_check,
    DROP COLUMN IF EXISTS automatic_invoice_refund_enabled,
    DROP COLUMN IF EXISTS stripe_refund_updated_at,
    DROP COLUMN IF EXISTS stripe_refund_needs_attention,
    DROP COLUMN IF EXISTS stripe_refund_status,
    DROP COLUMN IF EXISTS stripe_amount_refunded_bani,
    DROP COLUMN IF EXISTS stripe_charge_id;
