-- +goose Up
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS description TEXT;

-- +goose Down
ALTER TABLE ticket_types DROP COLUMN IF EXISTS description;
