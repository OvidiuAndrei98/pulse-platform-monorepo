-- +goose Up
CREATE TABLE event_artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    image_url TEXT,
    stage VARCHAR(120),
    performance_time VARCHAR(40),
    spotify_url TEXT,
    source VARCHAR(16) NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('SPOTIFY', 'MANUAL')),
    is_headliner BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX event_artists_event_sort_idx
    ON event_artists(event_id, sort_order, created_at);

-- +goose Down
DROP TABLE IF EXISTS event_artists;
