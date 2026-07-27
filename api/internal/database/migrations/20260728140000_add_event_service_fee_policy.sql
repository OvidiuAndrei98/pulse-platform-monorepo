-- +goose Up
ALTER TABLE events
    ADD COLUMN organizer_absorbs_service_fee BOOLEAN NOT NULL DEFAULT FALSE;

-- +goose Down
ALTER TABLE events
    DROP COLUMN IF EXISTS organizer_absorbs_service_fee;
