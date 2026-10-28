-- +goose Up
-- This service is independent of ticket commissions. Disconnecting a provider
-- must not reset its lifetime free allowance.
CREATE TABLE organizer_invoice_service (
    organizer_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    free_limit INTEGER NOT NULL DEFAULT 20 CHECK (free_limit = 20),
    free_used INTEGER NOT NULL DEFAULT 0 CHECK (free_used BETWEEN 0 AND 20),
    unit_price_bani INTEGER NOT NULL DEFAULT 50 CHECK (unit_price_bani = 50),
    paid_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    consented_at TIMESTAMPTZ,
    consent_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (NOT paid_enabled OR (consented_at IS NOT NULL AND consent_version IS NOT NULL))
);

INSERT INTO organizer_invoice_service(organizer_id,free_used)
SELECT organizer_id, LEAST(20, COUNT(*) FILTER (WHERE status='issued'))::INTEGER
FROM (
    SELECT organizer_id, status FROM billing_invoices
    UNION ALL SELECT organizer_id, NULL::VARCHAR FROM organizer_invoicing_settings
) existing GROUP BY organizer_id;

CREATE TABLE invoice_service_usage (
    invoice_id UUID PRIMARY KEY REFERENCES billing_invoices(id) ON DELETE CASCADE,
    organizer_id UUID NOT NULL REFERENCES organizer_invoice_service(organizer_id) ON DELETE CASCADE,
    is_free BOOLEAN NOT NULL,
    fee_bani INTEGER NOT NULL CHECK (fee_bani IN (0,50)),
    state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','dispatching','issued','needs_review')),
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((is_free AND fee_bani=0) OR (NOT is_free AND fee_bani=50))
);
CREATE INDEX invoice_service_usage_organizer_state ON invoice_service_usage(organizer_id,state);
-- platform_fee_bani remains the total application fee sent to Stripe. This
-- component is tracked independently and never added to the customer total.
ALTER TABLE orders ADD COLUMN invoice_service_fee_bani INTEGER NOT NULL DEFAULT 0
    CHECK (invoice_service_fee_bani IN (0,50) AND invoice_service_fee_bani <= platform_fee_bani);
ALTER TABLE orders ADD COLUMN invoice_service_fee_state TEXT NOT NULL DEFAULT 'none'
    CHECK (invoice_service_fee_state IN ('none','held','earned','refund_pending','refunded'));
ALTER TABLE orders ADD COLUMN invoice_service_fee_refund_id TEXT;
ALTER TABLE orders ADD COLUMN invoice_service_fee_next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX orders_invoice_service_fee_pending ON orders(invoice_service_fee_next_attempt_at)
    WHERE invoice_service_fee_state IN ('held','refund_pending');
ALTER TABLE billing_invoices ADD COLUMN claim_token UUID;
ALTER TABLE billing_invoices DROP CONSTRAINT billing_invoices_status_check;
ALTER TABLE billing_invoices ADD CONSTRAINT billing_invoices_status_check
    CHECK (status IN ('pending','processing','dispatching','issued','failed','needs_review'));

-- Keep these tables for existing deployments and the dispatch journal, but do not disable integrations
-- when installing this legacy schema on a database with more than 20 invoices.

-- +goose Down
ALTER TABLE orders DROP COLUMN invoice_service_fee_bani, DROP COLUMN invoice_service_fee_state,
    DROP COLUMN invoice_service_fee_refund_id, DROP COLUMN invoice_service_fee_next_attempt_at;
UPDATE billing_invoices SET status='needs_review' WHERE status='dispatching';
ALTER TABLE billing_invoices DROP CONSTRAINT billing_invoices_status_check;
ALTER TABLE billing_invoices ADD CONSTRAINT billing_invoices_status_check
    CHECK (status IN ('pending','processing','issued','failed','needs_review'));
ALTER TABLE billing_invoices DROP COLUMN claim_token;
DROP TABLE invoice_service_usage;
DROP TABLE organizer_invoice_service;
