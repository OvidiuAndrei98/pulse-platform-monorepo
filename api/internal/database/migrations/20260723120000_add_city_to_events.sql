-- +goose Up
ALTER TABLE events
ADD COLUMN IF NOT EXISTS city VARCHAR(100) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS events_city_idx ON events (city);

-- +goose Down
DROP INDEX IF EXISTS events_city_idx;
ALTER TABLE events DROP COLUMN IF EXISTS city;
