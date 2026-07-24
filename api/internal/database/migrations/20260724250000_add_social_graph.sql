-- +goose Up
CREATE TABLE organizer_follows (
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, organizer_id),
    CHECK (follower_id <> organizer_id)
);

CREATE INDEX friendships_friend_status_idx ON friendships (friend_id, status);
CREATE INDEX organizer_follows_organizer_idx ON organizer_follows (organizer_id);
CREATE INDEX event_rsvps_updated_at_idx ON event_rsvps (updated_at DESC);

-- +goose Down
DROP INDEX IF EXISTS event_rsvps_updated_at_idx;
DROP INDEX IF EXISTS organizer_follows_organizer_idx;
DROP INDEX IF EXISTS friendships_friend_status_idx;
DROP TABLE IF EXISTS organizer_follows;
