-- +goose Up
ALTER TABLE events
ADD COLUMN IF NOT EXISTS vibe VARCHAR(50) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS events_vibe_idx ON events (vibe);

-- +goose Down
DROP INDEX IF EXISTS events_vibe_idx;
ALTER TABLE events DROP COLUMN IF EXISTS vibe;
