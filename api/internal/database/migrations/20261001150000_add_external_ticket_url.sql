-- +goose Up
ALTER TABLE events
    ADD COLUMN external_ticket_url TEXT,
    ADD CONSTRAINT events_external_ticket_url_https_check
        CHECK (
            external_ticket_url IS NULL
            OR (
                char_length(external_ticket_url) BETWEEN 1 AND 2048
                AND external_ticket_url ~* '^https://[^[:space:]]+$'
            )
        );

-- Every Spottr ticketing artifact takes a shared lock on its parent event.
-- Changing an event to external ticketing takes the conflicting row-update
-- lock, so the check below cannot race an insert from either a new or an old
-- API task during a rolling deployment.
-- +goose StatementBegin
CREATE FUNCTION require_spottr_ticketing_event() RETURNS trigger AS $$
DECLARE
    configured_external_url TEXT;
BEGIN
    SELECT external_ticket_url
    INTO configured_external_url
    FROM events
    WHERE id = NEW.event_id
    FOR SHARE;

    IF configured_external_url IS NOT NULL THEN
        RAISE EXCEPTION 'Spottr ticketing artifacts are disabled for external-ticket events'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE TRIGGER ticket_types_require_spottr_ticketing
    BEFORE INSERT OR UPDATE OF event_id ON ticket_types
    FOR EACH ROW EXECUTE FUNCTION require_spottr_ticketing_event();

CREATE TRIGGER orders_require_spottr_ticketing
    BEFORE INSERT OR UPDATE OF event_id ON orders
    FOR EACH ROW EXECUTE FUNCTION require_spottr_ticketing_event();

CREATE TRIGGER invitations_require_spottr_ticketing
    BEFORE INSERT OR UPDATE OF event_id ON invitation_tickets
    FOR EACH ROW EXECUTE FUNCTION require_spottr_ticketing_event();

CREATE TRIGGER promo_codes_require_spottr_ticketing
    BEFORE INSERT OR UPDATE OF event_id ON promo_codes
    FOR EACH ROW EXECUTE FUNCTION require_spottr_ticketing_event();

-- +goose StatementBegin
CREATE FUNCTION prevent_external_ticketing_with_spottr_artifacts() RETURNS trigger AS $$
BEGIN
    IF NEW.external_ticket_url IS NOT NULL
       AND OLD.external_ticket_url IS DISTINCT FROM NEW.external_ticket_url
       AND (
           EXISTS (SELECT 1 FROM ticket_types WHERE event_id = NEW.id)
           OR EXISTS (SELECT 1 FROM orders WHERE event_id = NEW.id)
           OR EXISTS (SELECT 1 FROM invitation_tickets WHERE event_id = NEW.id)
           OR EXISTS (SELECT 1 FROM promo_codes WHERE event_id = NEW.id)
       ) THEN
        RAISE EXCEPTION 'Event has Spottr ticketing artifacts and cannot use external ticketing'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE TRIGGER events_prevent_unsafe_external_ticketing
    BEFORE UPDATE OF external_ticket_url ON events
    FOR EACH ROW EXECUTE FUNCTION prevent_external_ticketing_with_spottr_artifacts();

-- +goose Down
DROP TRIGGER IF EXISTS events_prevent_unsafe_external_ticketing ON events;
DROP FUNCTION IF EXISTS prevent_external_ticketing_with_spottr_artifacts();
DROP TRIGGER IF EXISTS promo_codes_require_spottr_ticketing ON promo_codes;
DROP TRIGGER IF EXISTS invitations_require_spottr_ticketing ON invitation_tickets;
DROP TRIGGER IF EXISTS orders_require_spottr_ticketing ON orders;
DROP TRIGGER IF EXISTS ticket_types_require_spottr_ticketing ON ticket_types;
DROP FUNCTION IF EXISTS require_spottr_ticketing_event();

ALTER TABLE events
    DROP CONSTRAINT IF EXISTS events_external_ticket_url_https_check,
    DROP COLUMN IF EXISTS external_ticket_url;
