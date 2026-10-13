-- +goose Up
CREATE TABLE notification_push_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expo_token TEXT NOT NULL UNIQUE,
    revoke_hash TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    language TEXT NOT NULL CHECK (language IN ('ro', 'en')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX notification_push_devices_user_idx ON notification_push_devices(user_id) WHERE enabled;

-- Revoking a registration must also block a delayed HTTP registration that has
-- not committed yet. Store only capability hashes, not tokens or account data.
CREATE TABLE notification_push_revocations (
    revoke_hash TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX notification_push_revocations_created_idx ON notification_push_revocations(created_at);

CREATE TABLE notification_push_deliveries (
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES notification_push_devices(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'receipt', 'done', 'dropped')),
    registration_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    ticket_id TEXT,
    available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(notification_id, device_id)
);
CREATE INDEX notification_push_deliveries_due_idx ON notification_push_deliveries(available_at)
    WHERE state IN ('queued', 'receipt');

-- Only new notifications are queued, in the same transaction as the action.
-- Registering a device never floods it with historical notifications.
-- +goose StatementBegin
CREATE FUNCTION enqueue_notification_push() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notification_push_deliveries(notification_id, device_id, user_id, registration_hash)
    SELECT NEW.id, device.id, NEW.user_id, device.revoke_hash FROM notification_push_devices device
    WHERE device.user_id=NEW.user_id AND device.enabled
      AND device.updated_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
      AND (NEW.expires_at IS NULL OR NEW.expires_at > CURRENT_TIMESTAMP);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER notification_push_created AFTER INSERT ON notifications
    FOR EACH ROW EXECUTE FUNCTION enqueue_notification_push();

-- +goose Down
DROP TRIGGER IF EXISTS notification_push_created ON notifications;
DROP FUNCTION IF EXISTS enqueue_notification_push();
DROP TABLE IF EXISTS notification_push_deliveries;
DROP TABLE IF EXISTS notification_push_devices;
DROP TABLE IF EXISTS notification_push_revocations;
