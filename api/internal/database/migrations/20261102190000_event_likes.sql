-- +goose Up
CREATE TABLE event_likes (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id,event_id)
);
CREATE INDEX event_likes_event_idx ON event_likes(event_id,user_id);
-- +goose Down
DROP TABLE event_likes;
