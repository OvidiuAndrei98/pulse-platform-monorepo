-- +goose Up
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX notifications_user_created_idx
    ON notifications (user_id, created_at DESC);

CREATE INDEX notifications_user_unread_idx
    ON notifications (user_id, created_at DESC)
    WHERE read_at IS NULL;

-- +goose Down
DROP INDEX IF EXISTS notifications_user_unread_idx;
DROP INDEX IF EXISTS notifications_user_created_idx;
DROP TABLE IF EXISTS notifications;
