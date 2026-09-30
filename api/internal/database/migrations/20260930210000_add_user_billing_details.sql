-- +goose Up
-- Billing profiles contain invoice identity/address data only. Payment card data
-- continues to be handled exclusively by Stripe.
CREATE TABLE user_billing_details (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    billing_type TEXT NOT NULL CHECK (billing_type IN ('individual', 'company')),
    name TEXT NOT NULL,
    tax_id TEXT NOT NULL DEFAULT '',
    registration_number TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    county TEXT NOT NULL DEFAULT '',
    sector TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- +goose Down
DROP TABLE user_billing_details;
