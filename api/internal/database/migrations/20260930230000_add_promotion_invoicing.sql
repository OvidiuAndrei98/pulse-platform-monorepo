-- +goose Up
ALTER TABLE promotion_campaigns
    ADD COLUMN stripe_livemode BOOLEAN,
    ADD COLUMN billing_email TEXT NOT NULL DEFAULT '',
    ADD COLUMN billing_type TEXT NOT NULL DEFAULT ''
        CHECK (billing_type IN ('', 'individual', 'company')),
    ADD COLUMN billing_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN billing_tax_id TEXT NOT NULL DEFAULT '',
    ADD COLUMN billing_registration_number TEXT NOT NULL DEFAULT '',
    ADD COLUMN billing_address TEXT NOT NULL DEFAULT '',
    ADD COLUMN billing_city TEXT NOT NULL DEFAULT '',
    ADD COLUMN billing_county TEXT NOT NULL DEFAULT '',
    ADD COLUMN billing_sector TEXT NOT NULL DEFAULT '',
    ADD COLUMN billing_country TEXT NOT NULL DEFAULT '',
    ADD COLUMN invoice_provider TEXT NOT NULL DEFAULT ''
        CHECK (invoice_provider IN ('', 'oblio', 'smartbill')),
    ADD COLUMN invoice_issuer_account_email TEXT NOT NULL DEFAULT '',
    ADD COLUMN invoice_issuer_company_vat_code TEXT NOT NULL DEFAULT '',
    ADD COLUMN invoice_issuer_series_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN invoice_vat_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN invoice_vat_percentage NUMERIC(5,2) NOT NULL DEFAULT 0
        CHECK (invoice_vat_percentage >= 0 AND invoice_vat_percentage <= 100),
    ADD COLUMN invoice_send_email BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN invoice_send_to_spv BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN invoice_payment_type TEXT NOT NULL DEFAULT '';

-- This table deliberately has no cascading foreign keys. Fiscal records and
-- payment evidence must survive deletion/anonymisation of the account, event,
-- or campaign that originally produced them.
CREATE TABLE promotion_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL UNIQUE,
    organizer_id UUID NOT NULL,
    event_id UUID NOT NULL,
    payment_intent_id VARCHAR(255) NOT NULL UNIQUE,
    stripe_livemode BOOLEAN NOT NULL,
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('oblio', 'smartbill')),
    issuer_account_email TEXT NOT NULL,
    issuer_company_vat_code TEXT NOT NULL,
    issuer_series_name TEXT NOT NULL,
    vat_name TEXT NOT NULL,
    vat_percentage NUMERIC(5,2) NOT NULL CHECK (vat_percentage >= 0 AND vat_percentage <= 100),
    send_email BOOLEAN NOT NULL,
    send_to_spv BOOLEAN NOT NULL,
    payment_type TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    billing_type TEXT NOT NULL CHECK (billing_type IN ('individual', 'company')),
    billing_name TEXT NOT NULL,
    billing_tax_id TEXT NOT NULL DEFAULT '',
    billing_registration_number TEXT NOT NULL DEFAULT '',
    billing_address TEXT NOT NULL,
    billing_city TEXT NOT NULL,
    billing_county TEXT NOT NULL DEFAULT '',
    billing_sector TEXT NOT NULL DEFAULT '',
    billing_country TEXT NOT NULL,
    event_title TEXT NOT NULL,
    plan promotion_plan NOT NULL,
    placement promotion_placement NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    amount_bani INT NOT NULL CHECK (amount_bani > 0),
    currency CHAR(3) NOT NULL DEFAULT 'RON' CHECK (currency = 'RON'),
    status VARCHAR(24) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'dispatching', 'issued', 'failed', 'needs_review')),
    claim_token UUID,
    attempt_count INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    external_series VARCHAR(64),
    external_number VARCHAR(64),
    external_document_id VARCHAR(128),
    document_url TEXT,
    error_message TEXT,
    refunded_amount_bani INT NOT NULL DEFAULT 0 CHECK (refunded_amount_bani >= 0),
    refund_status VARCHAR(24) NOT NULL DEFAULT 'none'
        CHECK (refund_status IN ('none', 'pending', 'partial', 'full', 'failed', 'needs_review')),
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (ends_at > starts_at)
);

CREATE INDEX promotion_invoices_processing_idx
    ON promotion_invoices (status, next_attempt_at, created_at)
    WHERE status IN ('pending', 'failed', 'processing', 'dispatching');
CREATE INDEX promotion_invoices_organizer_idx
    ON promotion_invoices (organizer_id, created_at DESC);

CREATE TABLE promotion_refund_states (
    payment_intent_id VARCHAR(255) PRIMARY KEY,
    campaign_id UUID,
    stripe_refund_id VARCHAR(255),
    stripe_charge_id VARCHAR(255),
    stripe_livemode BOOLEAN NOT NULL,
    refunded_amount_bani INT NOT NULL DEFAULT 0 CHECK (refunded_amount_bani >= 0),
    charge_amount_bani INT NOT NULL DEFAULT 0 CHECK (charge_amount_bani >= 0),
    status VARCHAR(24) NOT NULL CHECK (status IN ('pending', 'partial', 'full', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE promotion_checkout_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL UNIQUE,
    reason VARCHAR(64) NOT NULL,
    stripe_checkout_session_id VARCHAR(255),
    stripe_payment_intent_id VARCHAR(255),
    stripe_livemode BOOLEAN,
    status VARCHAR(24) NOT NULL DEFAULT 'needs_review'
        CHECK (status IN ('needs_review', 'resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX promotion_checkout_reviews_status_idx
    ON promotion_checkout_reviews (status, created_at)
    WHERE status = 'needs_review';

-- Historical rows predate billing snapshots and Stripe mode evidence. They are
-- intentionally not backfilled or invoiced automatically.

-- +goose Down
DROP INDEX IF EXISTS promotion_checkout_reviews_status_idx;
DROP TABLE IF EXISTS promotion_checkout_reviews;
DROP TABLE IF EXISTS promotion_refund_states;
DROP INDEX IF EXISTS promotion_invoices_organizer_idx;
DROP INDEX IF EXISTS promotion_invoices_processing_idx;
DROP TABLE IF EXISTS promotion_invoices;

ALTER TABLE promotion_campaigns
    DROP COLUMN IF EXISTS invoice_payment_type,
    DROP COLUMN IF EXISTS invoice_send_to_spv,
    DROP COLUMN IF EXISTS invoice_send_email,
    DROP COLUMN IF EXISTS invoice_vat_percentage,
    DROP COLUMN IF EXISTS invoice_vat_name,
    DROP COLUMN IF EXISTS invoice_issuer_series_name,
    DROP COLUMN IF EXISTS invoice_issuer_company_vat_code,
    DROP COLUMN IF EXISTS invoice_issuer_account_email,
    DROP COLUMN IF EXISTS invoice_provider,
    DROP COLUMN IF EXISTS billing_country,
    DROP COLUMN IF EXISTS billing_sector,
    DROP COLUMN IF EXISTS billing_county,
    DROP COLUMN IF EXISTS billing_city,
    DROP COLUMN IF EXISTS billing_address,
    DROP COLUMN IF EXISTS billing_registration_number,
    DROP COLUMN IF EXISTS billing_tax_id,
    DROP COLUMN IF EXISTS billing_name,
    DROP COLUMN IF EXISTS billing_type,
    DROP COLUMN IF EXISTS billing_email,
    DROP COLUMN IF EXISTS stripe_livemode;
