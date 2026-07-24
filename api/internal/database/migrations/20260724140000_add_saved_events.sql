-- +goose Up
CREATE TABLE saved_events (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, event_id)
);

CREATE INDEX idx_saved_events_user_created_at
    ON saved_events (user_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS saved_events;
