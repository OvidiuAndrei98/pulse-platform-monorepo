-- +goose Up
ALTER TABLE events ADD COLUMN IF NOT EXISTS google_place_id VARCHAR(255) NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE events DROP COLUMN IF EXISTS google_place_id;
