-- +goose Up
CREATE TABLE event_rsvps (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL CHECK (status IN ('interested', 'going')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, event_id)
);

CREATE INDEX event_rsvps_event_status_idx ON event_rsvps (event_id, status);

-- +goose Down
DROP TABLE IF EXISTS event_rsvps;
