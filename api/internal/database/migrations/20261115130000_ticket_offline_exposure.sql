-- +goose Up
-- A credential actually delivered to an offline scanner can never be rotated.
-- The event-level gate remains the cutoff for NEW gift checkouts. It must not
-- strand a gift paid after a pack was made: that new ticket was never in it.
ALTER TABLE tickets ADD COLUMN offline_credential_exposed BOOLEAN NOT NULL DEFAULT FALSE;
-- Conservative backfill: old packs may already have been removed by retention.
UPDATE tickets t SET offline_credential_exposed=TRUE
FROM orders o JOIN events e ON e.id=o.event_id
WHERE t.order_id=o.id AND (e.ticket_transfers_locked OR EXISTS(
 SELECT 1 FROM offline_validation_snapshot_entries s WHERE s.ticket_id=t.id AND s.kind='ticket'));

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION capture_offline_snapshot_entries() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO offline_validation_snapshot_entries(snapshot_id,ticket_id,validation_hash,ticket_type,kind)
  SELECT NEW.id,t.id,t.validation_hash,tt.name,'ticket'
  FROM tickets t JOIN ticket_types tt ON tt.id=t.ticket_type_id JOIN orders o ON o.id=t.order_id
  WHERE tt.event_id=NEW.event_id AND o.status='completed' AND NOT t.is_validated
   AND o.stripe_refund_status='none' AND o.stripe_amount_refunded_bani=0 AND NOT o.stripe_refund_needs_attention;
 UPDATE tickets t SET offline_credential_exposed=TRUE
  FROM offline_validation_snapshot_entries s WHERE s.snapshot_id=NEW.id AND s.kind='ticket' AND s.ticket_id=t.id;
 INSERT INTO offline_validation_snapshot_entries(snapshot_id,ticket_id,validation_hash,ticket_type,kind)
  SELECT NEW.id,i.id,i.validation_hash,COALESCE(tt.name,'Invitatie'),'invitation'
  FROM invitation_tickets i LEFT JOIN ticket_types tt ON tt.id=i.ticket_type_id
  WHERE i.event_id=NEW.event_id AND i.revoked_at IS NULL AND i.validated_at IS NULL;
 UPDATE offline_validation_snapshots SET ticket_count=(SELECT count(*) FROM offline_validation_snapshot_entries WHERE snapshot_id=NEW.id) WHERE id=NEW.id;
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
-- Defend credentials even against a stale writer that bypasses the new API.
-- Snapshot creation and supported rotations already lock the event first.
-- +goose StatementBegin
CREATE FUNCTION guard_exposed_offline_credential() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.offline_credential_exposed AND (NOT NEW.offline_credential_exposed OR NEW.validation_hash IS DISTINCT FROM OLD.validation_hash) THEN
  RAISE EXCEPTION 'OFFLINE_CREDENTIAL_EXPOSED';
 END IF;
 IF NEW.validation_hash IS DISTINCT FROM OLD.validation_hash THEN
  PERFORM e.id FROM events e JOIN orders o ON o.event_id=e.id WHERE o.id=OLD.order_id FOR UPDATE OF e;
 END IF;
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER guard_exposed_offline_credential BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION guard_exposed_offline_credential();

-- +goose Down
-- Restore the older conservative event-wide cutoff before removing metadata.
-- No tickets, orders, snapshots or credentials are removed by rollback.
UPDATE events e SET ticket_transfers_locked=TRUE WHERE EXISTS(
 SELECT 1 FROM tickets t JOIN orders o ON o.id=t.order_id WHERE o.event_id=e.id AND t.offline_credential_exposed);
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION capture_offline_snapshot_entries() RETURNS trigger LANGUAGE plpgsql AS $$
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
DROP TRIGGER guard_exposed_offline_credential ON tickets;
DROP FUNCTION guard_exposed_offline_credential();
ALTER TABLE tickets DROP COLUMN offline_credential_exposed;
