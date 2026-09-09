-- +goose Up
ALTER TABLE orders
    ADD COLUMN completed_at TIMESTAMPTZ;

UPDATE orders
SET completed_at = CASE WHEN status = 'completed' THEN created_at ELSE completed_at END,
    invoice_requested = TRUE
WHERE invoice_requested = FALSE
   OR (status = 'completed' AND completed_at IS NULL);

CREATE TABLE platform_commission_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('oblio', 'smartbill')),
    status VARCHAR(24) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'issued', 'failed', 'needs_review')),
    transaction_count INT NOT NULL CHECK (transaction_count > 0),
    total_fee_bani BIGINT NOT NULL CHECK (total_fee_bani > 0),
    attempt_count INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    external_series VARCHAR(64),
    external_number VARCHAR(64),
    external_document_id VARCHAR(128),
    document_url TEXT,
    error_message TEXT,
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT platform_commission_invoice_period_check CHECK (period_end > period_start),
    CONSTRAINT platform_commission_invoice_month_unique UNIQUE (organizer_id, period_start)
);

CREATE INDEX platform_commission_invoices_processing_idx
    ON platform_commission_invoices (status, next_attempt_at, created_at)
    WHERE status IN ('pending', 'failed', 'processing');

CREATE INDEX platform_commission_invoices_organizer_idx
    ON platform_commission_invoices (organizer_id, period_start DESC);

-- +goose Down
DROP INDEX IF EXISTS platform_commission_invoices_organizer_idx;
DROP INDEX IF EXISTS platform_commission_invoices_processing_idx;
DROP TABLE IF EXISTS platform_commission_invoices;

ALTER TABLE orders
    DROP COLUMN IF EXISTS completed_at;
