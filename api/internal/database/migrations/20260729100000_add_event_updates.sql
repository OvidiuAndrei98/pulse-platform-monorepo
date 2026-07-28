-- +goose Up
CREATE TABLE event_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    caption VARCHAR(160),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    CONSTRAINT event_updates_caption_length_check
        CHECK (caption IS NULL OR char_length(caption) <= 160)
);

CREATE INDEX event_updates_event_active_idx
    ON event_updates(event_id, expires_at DESC);

CREATE INDEX event_updates_organizer_active_idx
    ON event_updates(organizer_id, expires_at DESC);

-- +goose Down
DROP TABLE IF EXISTS event_updates;
