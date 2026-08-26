-- +goose Up
ALTER TABLE events
    ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;

UPDATE events
SET status = 'completed', is_live = FALSE
WHERE end_time <= CURRENT_TIMESTAMP
  AND status IN ('draft', 'published');

CREATE INDEX IF NOT EXISTS events_scheduled_publish_idx
    ON events (publish_at)
    WHERE status = 'scheduled';

-- +goose Down
DROP INDEX IF EXISTS events_scheduled_publish_idx;
ALTER TABLE events DROP COLUMN IF EXISTS publish_at;
