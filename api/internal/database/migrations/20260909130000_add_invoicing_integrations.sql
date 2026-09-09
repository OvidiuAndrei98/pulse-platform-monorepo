-- +goose Up
ALTER TABLE orders
    ADD COLUMN invoice_requested BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN billing_type VARCHAR(20) NOT NULL DEFAULT 'individual',
    ADD COLUMN billing_name VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN billing_tax_id VARCHAR(32) NOT NULL DEFAULT '',
    ADD COLUMN billing_registration_number VARCHAR(64) NOT NULL DEFAULT '',
    ADD COLUMN billing_address TEXT NOT NULL DEFAULT '',
    ADD COLUMN billing_city VARCHAR(128) NOT NULL DEFAULT '',
    ADD COLUMN billing_county VARCHAR(128) NOT NULL DEFAULT '',
    ADD COLUMN billing_country VARCHAR(64) NOT NULL DEFAULT 'Romania';

ALTER TABLE orders
    ADD CONSTRAINT orders_billing_type_check
    CHECK (billing_type IN ('individual', 'company'));

CREATE TABLE organizer_invoicing_settings (
    organizer_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('oblio', 'smartbill')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    account_email VARCHAR(255) NOT NULL,
    credentials_encrypted BYTEA NOT NULL,
    company_vat_code VARCHAR(32) NOT NULL,
    series_name VARCHAR(64) NOT NULL,
    vat_name VARCHAR(64) NOT NULL DEFAULT 'Normala',
    vat_percentage NUMERIC(5,2) NOT NULL DEFAULT 21 CHECK (vat_percentage >= 0 AND vat_percentage <= 100),
    send_email BOOLEAN NOT NULL DEFAULT TRUE,
    send_to_spv BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE billing_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX billing_invoices_processing_idx
    ON billing_invoices (status, next_attempt_at, created_at)
    WHERE status IN ('pending', 'failed', 'processing');

CREATE INDEX billing_invoices_organizer_idx
    ON billing_invoices (organizer_id, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS billing_invoices_organizer_idx;
DROP INDEX IF EXISTS billing_invoices_processing_idx;
DROP TABLE IF EXISTS billing_invoices;
DROP TABLE IF EXISTS organizer_invoicing_settings;

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_billing_type_check,
    DROP COLUMN IF EXISTS billing_country,
    DROP COLUMN IF EXISTS billing_county,
    DROP COLUMN IF EXISTS billing_city,
    DROP COLUMN IF EXISTS billing_address,
    DROP COLUMN IF EXISTS billing_registration_number,
    DROP COLUMN IF EXISTS billing_tax_id,
    DROP COLUMN IF EXISTS billing_name,
    DROP COLUMN IF EXISTS billing_type,
    DROP COLUMN IF EXISTS invoice_requested;
