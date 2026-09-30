-- +goose Up

ALTER TABLE notifications
    ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX notifications_expiry_idx
    ON notifications (expires_at)
    WHERE expires_at IS NOT NULL;

CREATE TABLE event_safety_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE (owner_id, event_id),
    CHECK (expires_at > created_at)
);

CREATE TABLE event_safety_group_members (
    group_id UUID NOT NULL REFERENCES event_safety_groups(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted')),
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (group_id, user_id),
    UNIQUE (event_id, user_id)
);

CREATE INDEX event_safety_group_members_user_idx
    ON event_safety_group_members (user_id, event_id);

CREATE TABLE event_safety_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES event_safety_groups(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(24) NOT NULL DEFAULT 'message'
        CHECK (kind IN ('message', 'help', 'help_resolved', 'system')),
    content VARCHAR(500) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CHECK (expires_at > created_at)
);

CREATE INDEX event_safety_messages_group_created_idx
    ON event_safety_messages (group_id, created_at DESC);

CREATE INDEX event_safety_messages_expiry_idx
    ON event_safety_messages (expires_at);

-- +goose Down

DROP TABLE IF EXISTS event_safety_messages;
DROP TABLE IF EXISTS event_safety_group_members;
DROP TABLE IF EXISTS event_safety_groups;
DROP INDEX IF EXISTS notifications_expiry_idx;
ALTER TABLE notifications DROP COLUMN IF EXISTS expires_at;
