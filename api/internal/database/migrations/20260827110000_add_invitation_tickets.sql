-- +goose Up
CREATE TABLE invitation_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    ticket_type_id UUID REFERENCES ticket_types(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    label VARCHAR(120) NOT NULL,
    validation_hash VARCHAR(64) UNIQUE NOT NULL,
    validated_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX invitation_tickets_event_idx ON invitation_tickets(event_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS invitation_tickets;
