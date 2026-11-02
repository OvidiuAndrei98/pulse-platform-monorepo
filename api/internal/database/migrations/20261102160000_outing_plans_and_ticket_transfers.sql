-- +goose Up
ALTER TABLE event_safety_groups ADD COLUMN meeting_point VARCHAR(160) NOT NULL DEFAULT '';
CREATE TABLE outing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    title VARCHAR(80) NOT NULL,
    chosen_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP + interval '30 days',
    UNIQUE(owner_id, request_id)
);
CREATE TABLE outing_plan_members (
    plan_id UUID NOT NULL REFERENCES outing_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL CHECK(status IN ('pending','accepted','declined')),
    PRIMARY KEY(plan_id,user_id)
);
CREATE INDEX outing_members_user_idx ON outing_plan_members(user_id,plan_id);
CREATE TABLE outing_plan_options (
    plan_id UUID NOT NULL REFERENCES outing_plans(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL CHECK(position BETWEEN 0 AND 3),
    PRIMARY KEY(plan_id,event_id),
    UNIQUE(plan_id,position)
);
CREATE TABLE outing_plan_votes (
    plan_id UUID NOT NULL,
    user_id UUID NOT NULL,
    event_id UUID NOT NULL,
    PRIMARY KEY(plan_id,user_id),
    FOREIGN KEY(plan_id,user_id) REFERENCES outing_plan_members(plan_id,user_id) ON DELETE CASCADE,
    FOREIGN KEY(plan_id,event_id) REFERENCES outing_plan_options(plan_id,event_id) ON DELETE CASCADE
);
CREATE TABLE ticket_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
    recipient_email VARCHAR(254) NOT NULL,
    request_id UUID NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled','expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ,
    notified_at TIMESTAMPTZ,
    UNIQUE(sender_id,request_id),
    CHECK(sender_id <> recipient_id),
    CHECK(status <> 'accepted' OR recipient_id IS NOT NULL)
);
CREATE UNIQUE INDEX ticket_transfer_pending_idx ON ticket_transfers(ticket_id) WHERE status='pending';
CREATE INDEX ticket_transfer_recipient_idx ON ticket_transfers(recipient_id,created_at DESC);
CREATE INDEX ticket_transfer_email_idx ON ticket_transfers(recipient_email) WHERE status='pending';
ALTER TABLE tickets ADD COLUMN validation_generation INTEGER NOT NULL DEFAULT 0 CHECK(validation_generation>=0);
-- +goose StatementBegin
CREATE FUNCTION guard_rotated_ticket_validation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected TEXT;
BEGIN
    IF OLD.validation_generation>0 AND NOT OLD.is_validated AND NEW.is_validated THEN
        expected := current_setting('spottr.validation_hash',TRUE);
        PERFORM set_config('spottr.validation_hash','',TRUE);
        IF expected IS DISTINCT FROM OLD.validation_hash THEN
            RAISE EXCEPTION 'TICKET_VALIDATION_WRITER_OUTDATED';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER guard_rotated_ticket_validation BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION guard_rotated_ticket_validation();
-- A permanent gate survives snapshot retention/cleanup. Once an offline pack
-- exists, no transfer may rotate credentials already present on offline devices.
ALTER TABLE events ADD COLUMN ticket_transfers_locked BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE events SET ticket_transfers_locked=TRUE WHERE EXISTS
    (SELECT 1 FROM offline_validation_snapshots s WHERE s.event_id=events.id);

ALTER TABLE offline_validation_snapshots ADD COLUMN format_version SMALLINT NOT NULL DEFAULT 1;
CREATE TABLE offline_validation_snapshot_entries (
    snapshot_id UUID NOT NULL REFERENCES offline_validation_snapshots(id) ON DELETE CASCADE,
    ticket_id UUID NOT NULL,
    validation_hash VARCHAR(64) NOT NULL,
    ticket_type VARCHAR(255) NOT NULL,
    kind VARCHAR(16) NOT NULL CHECK(kind IN ('ticket','invitation')),
    PRIMARY KEY(snapshot_id,validation_hash)
);
-- Legacy API writers use the default format=1 and must fail even if another
-- task has since issued a new pack. Their separately read hashes may be stale.
-- +goose StatementBegin
CREATE FUNCTION guard_offline_snapshot_writer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.format_version <> 2 THEN
        RAISE EXCEPTION 'OFFLINE_SNAPSHOT_WRITER_OUTDATED';
    END IF;
    UPDATE events SET ticket_transfers_locked=TRUE WHERE id=NEW.event_id
        AND status IN ('published','scheduled') AND end_time>CURRENT_TIMESTAMP;
    IF NOT FOUND THEN RAISE EXCEPTION 'OFFLINE_EVENT_CLOSED'; END IF;
    RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER guard_offline_snapshot_writer BEFORE INSERT ON offline_validation_snapshots
    FOR EACH ROW EXECUTE FUNCTION guard_offline_snapshot_writer();
-- +goose StatementBegin
CREATE FUNCTION capture_offline_snapshot_entries() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO offline_validation_snapshot_entries(snapshot_id,ticket_id,validation_hash,ticket_type,kind)
        SELECT NEW.id,t.id,t.validation_hash,tt.name,'ticket'
        FROM tickets t JOIN ticket_types tt ON tt.id=t.ticket_type_id JOIN orders o ON o.id=t.order_id
        WHERE tt.event_id=NEW.event_id AND o.status='completed' AND NOT t.is_validated
            AND o.stripe_refund_status='none' AND o.stripe_amount_refunded_bani=0 AND NOT o.stripe_refund_needs_attention;
    INSERT INTO offline_validation_snapshot_entries(snapshot_id,ticket_id,validation_hash,ticket_type,kind)
        SELECT NEW.id,i.id,i.validation_hash,COALESCE(tt.name,'Invitatie'),'invitation'
        FROM invitation_tickets i LEFT JOIN ticket_types tt ON tt.id=i.ticket_type_id
        WHERE i.event_id=NEW.event_id AND i.revoked_at IS NULL AND i.validated_at IS NULL;
    UPDATE offline_validation_snapshots SET ticket_count=(SELECT count(*) FROM offline_validation_snapshot_entries WHERE snapshot_id=NEW.id) WHERE id=NEW.id;
    RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER capture_offline_snapshot_entries AFTER INSERT ON offline_validation_snapshots
    FOR EACH ROW EXECUTE FUNCTION capture_offline_snapshot_entries();

-- +goose Down
ALTER TABLE event_safety_groups DROP COLUMN meeting_point;
DROP TRIGGER IF EXISTS guard_rotated_ticket_validation ON tickets;
DROP FUNCTION IF EXISTS guard_rotated_ticket_validation();
ALTER TABLE tickets DROP COLUMN IF EXISTS validation_generation;
DROP TRIGGER capture_offline_snapshot_entries ON offline_validation_snapshots;
DROP FUNCTION capture_offline_snapshot_entries();
DROP TRIGGER guard_offline_snapshot_writer ON offline_validation_snapshots;
DROP FUNCTION guard_offline_snapshot_writer();
DROP TABLE offline_validation_snapshot_entries;
ALTER TABLE offline_validation_snapshots DROP COLUMN format_version;
ALTER TABLE events DROP COLUMN ticket_transfers_locked;
DROP TABLE ticket_transfers;
DROP TABLE outing_plan_votes;
DROP TABLE outing_plan_options;
DROP TABLE outing_plan_members;
DROP TABLE outing_plans;
