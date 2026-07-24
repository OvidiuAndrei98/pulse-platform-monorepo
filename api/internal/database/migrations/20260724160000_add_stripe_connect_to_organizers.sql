-- +goose Up
ALTER TABLE organizer_profiles
    ADD COLUMN stripe_account_id VARCHAR(255) UNIQUE,
    ADD COLUMN stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN stripe_details_submitted BOOLEAN NOT NULL DEFAULT FALSE;

-- +goose Down
ALTER TABLE organizer_profiles
    DROP COLUMN IF EXISTS stripe_details_submitted,
    DROP COLUMN IF EXISTS stripe_payouts_enabled,
    DROP COLUMN IF EXISTS stripe_charges_enabled,
    DROP COLUMN IF EXISTS stripe_account_id;
