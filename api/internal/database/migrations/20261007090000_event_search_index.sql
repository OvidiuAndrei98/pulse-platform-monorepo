-- +goose Up
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX events_search_trgm_idx ON events USING gin
  (lower(title || ' ' || location_name || ' ' || city || ' ' || category || ' ' || id::text) gin_trgm_ops);

-- +goose Down
DROP INDEX IF EXISTS events_search_trgm_idx;
