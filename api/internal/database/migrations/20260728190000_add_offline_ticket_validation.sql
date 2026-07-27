-- +goose Up
CREATE TABLE offline_validation_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_count INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX offline_validation_snapshots_event_user_idx
    ON offline_validation_snapshots(event_id, created_by_user_id);

CREATE TABLE offline_ticket_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_scan_id UUID NOT NULL UNIQUE,
    snapshot_id UUID NOT NULL REFERENCES offline_validation_snapshots(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    validated_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(128) NOT NULL,
    validation_hash TEXT NOT NULL,
    scanned_at TIMESTAMPTZ NOT NULL,
    synced_at TIMESTAMPTZ,
    server_validated_at TIMESTAMPTZ,
    result VARCHAR(32) NOT NULL DEFAULT 'processing',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT offline_ticket_validations_result_check
        CHECK (result IN ('processing', 'accepted', 'already_validated', 'invalid', 'wrong_event'))
);

CREATE INDEX offline_ticket_validations_event_idx
    ON offline_ticket_validations(event_id, created_at DESC);

CREATE INDEX offline_ticket_validations_ticket_idx
    ON offline_ticket_validations(ticket_id);

-- +goose Down
DROP TABLE IF EXISTS offline_ticket_validations;
DROP TABLE IF EXISTS offline_validation_snapshots;
