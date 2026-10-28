-- +goose Up
CREATE TABLE platform_commission_settings (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
    per_ticket_bani integer NOT NULL CHECK (per_ticket_bani BETWEEN 0 AND 100000),
    revision bigint NOT NULL DEFAULT 1,
    updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_commission_settings (rate_bps, per_ticket_bani) VALUES (400, 250);

-- NULL means inherit the current standard, never a copy of today's standard.
CREATE TABLE organizer_commission_overrides (
    organizer_id uuid PRIMARY KEY REFERENCES organizer_profiles(user_id) ON DELETE CASCADE,
    rate_bps integer CHECK (rate_bps BETWEEN 0 AND 10000),
    per_ticket_bani integer CHECK (per_ticket_bani BETWEEN 0 AND 100000),
    revision bigint NOT NULL DEFAULT 1,
    updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((rate_bps IS NULL) = (per_ticket_bani IS NULL))
);
CREATE VIEW effective_organizer_commissions AS
SELECT op.user_id AS organizer_id,
       COALESCE(o.rate_bps, s.rate_bps)::integer AS rate_bps,
       COALESCE(o.per_ticket_bani, s.per_ticket_bani)::integer AS per_ticket_bani
FROM organizer_profiles op CROSS JOIN platform_commission_settings s
LEFT JOIN organizer_commission_overrides o ON o.organizer_id = op.user_id;

CREATE TABLE commission_change_log (
    id bigserial PRIMARY KEY,
    organizer_id uuid,
    changed_by uuid,
    changed_at timestamptz NOT NULL DEFAULT now(),
    previous_values jsonb,
    new_values jsonb NOT NULL
);
-- +goose StatementBegin
CREATE FUNCTION record_commission_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO commission_change_log (organizer_id, changed_by, previous_values, new_values)
    VALUES ((to_jsonb(NEW)->>'organizer_id')::uuid, NEW.updated_by,
            CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW));
    RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER platform_commission_audit AFTER UPDATE ON platform_commission_settings
FOR EACH ROW EXECUTE FUNCTION record_commission_change();
CREATE TRIGGER organizer_commission_audit AFTER INSERT OR UPDATE ON organizer_commission_overrides
FOR EACH ROW EXECUTE FUNCTION record_commission_change();

-- +goose Down
DROP TRIGGER organizer_commission_audit ON organizer_commission_overrides;
DROP TRIGGER platform_commission_audit ON platform_commission_settings;
DROP FUNCTION record_commission_change();
DROP TABLE commission_change_log;
DROP VIEW effective_organizer_commissions;
DROP TABLE organizer_commission_overrides;
DROP TABLE platform_commission_settings;
