-- +goose Up
ALTER TABLE events
    ADD COLUMN was_published BOOLEAN NOT NULL DEFAULT FALSE;

-- Older completed records have no lifecycle history. Preserve the editions
-- that were already presented as completed before this flag existed.
UPDATE events
SET was_published = TRUE
WHERE status IN ('published', 'completed');

CREATE INDEX events_public_organizer_history_idx
    ON events(organizer_id, start_time DESC)
    WHERE was_published = TRUE AND status IN ('published', 'completed');

-- +goose Down
DROP INDEX IF EXISTS events_public_organizer_history_idx;
ALTER TABLE events DROP COLUMN IF EXISTS was_published;
