-- +goose Up
ALTER TABLE organizer_profiles
    ADD COLUMN organizer_agreement_version VARCHAR(64),
    ADD COLUMN organizer_agreement_accepted_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN organizer_agreement_accepted_ip INET;

-- +goose Down
ALTER TABLE organizer_profiles
    DROP COLUMN IF EXISTS organizer_agreement_accepted_ip,
    DROP COLUMN IF EXISTS organizer_agreement_accepted_at,
    DROP COLUMN IF EXISTS organizer_agreement_version;
