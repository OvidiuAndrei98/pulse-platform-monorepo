-- +goose Up
ALTER TABLE outing_plans ADD COLUMN revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE outing_plans ADD COLUMN decision_at TIMESTAMPTZ;
ALTER TABLE outing_plans ADD COLUMN deadline_reminded_at TIMESTAMPTZ;
ALTER TABLE outing_plans ADD COLUMN deadline_closed_notified_at TIMESTAMPTZ;
ALTER TABLE outing_plans ADD COLUMN meeting_point VARCHAR(160);
ALTER TABLE outing_plans ADD COLUMN meeting_at TIMESTAMPTZ;
ALTER TABLE outing_plans ADD COLUMN decision_round INTEGER NOT NULL DEFAULT 1 CHECK(decision_round>0);
ALTER TABLE outing_plans ADD COLUMN reopened_from_revision BIGINT;
ALTER TABLE outing_plan_members ADD COLUMN budget_bani INTEGER CHECK(budget_bani BETWEEN 0 AND 100000000);
ALTER TABLE outing_plan_members ADD COLUMN arrival_status VARCHAR(20) NOT NULL DEFAULT 'not_set'
  CHECK(arrival_status IN ('not_set','leaving_soon','on_way','arrived','not_coming'));
ALTER TABLE outing_plan_members ADD COLUMN arrival_updated_at TIMESTAMPTZ;

CREATE TABLE outing_plan_dates (
  plan_id UUID NOT NULL REFERENCES outing_plans(id) ON DELETE CASCADE,
  outing_date DATE NOT NULL,
  PRIMARY KEY(plan_id,outing_date)
);
CREATE TABLE outing_plan_availability (
  plan_id UUID NOT NULL, outing_date DATE NOT NULL, user_id UUID NOT NULL,
  answer VARCHAR(8) NOT NULL CHECK(answer IN ('yes','maybe','no')),
  PRIMARY KEY(plan_id,outing_date,user_id),
  FOREIGN KEY(plan_id,outing_date) REFERENCES outing_plan_dates(plan_id,outing_date) ON DELETE CASCADE,
  FOREIGN KEY(plan_id,user_id) REFERENCES outing_plan_members(plan_id,user_id) ON DELETE CASCADE
);
CREATE TABLE outing_plan_reactions (
  plan_id UUID NOT NULL, event_id UUID NOT NULL, user_id UUID NOT NULL,
  answer VARCHAR(8) NOT NULL CHECK(answer IN ('yes','maybe','no')),
  PRIMARY KEY(plan_id,event_id,user_id),
  FOREIGN KEY(plan_id,event_id) REFERENCES outing_plan_options(plan_id,event_id) ON DELETE CASCADE,
  FOREIGN KEY(plan_id,user_id) REFERENCES outing_plan_members(plan_id,user_id) ON DELETE CASCADE
);
CREATE TABLE outing_plan_decisions (
  plan_id UUID NOT NULL REFERENCES outing_plans(id) ON DELETE CASCADE,
  round INTEGER NOT NULL, event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  chosen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reopened_at TIMESTAMPTZ, reopen_reason VARCHAR(16) CHECK(reopen_reason IN ('sold_out','cancelled','other')),
  PRIMARY KEY(plan_id,round)
);

-- Nightlife dates run from 06:00 to 06:00 in Romania, including DST changes.
UPDATE outing_plans p SET outing_date=((e.start_time AT TIME ZONE 'Europe/Bucharest')-interval '6 hours')::date
FROM events e WHERE e.id=COALESCE(p.chosen_event_id,(SELECT o.event_id FROM outing_plan_options o WHERE o.plan_id=p.id ORDER BY o.position LIMIT 1));
INSERT INTO outing_plan_dates(plan_id,outing_date) SELECT id,outing_date FROM outing_plans WHERE outing_date IS NOT NULL;
INSERT INTO outing_plan_reactions(plan_id,event_id,user_id,answer) SELECT plan_id,event_id,user_id,'yes' FROM outing_plan_votes;
INSERT INTO outing_plan_decisions(plan_id,round,event_id,chosen_at)
  SELECT id,1,chosen_event_id,created_at FROM outing_plans WHERE chosen_event_id IS NOT NULL;
UPDATE outing_plans SET expires_at=GREATEST(expires_at,(outing_date+2)::timestamp AT TIME ZONE 'Europe/Bucharest') WHERE outing_date IS NOT NULL;

-- Notifications are transactional and reach every API replica listening on this
-- channel. They carry IDs/revisions only, never a member's vote, budget or QR.
-- +goose StatementBegin
CREATE FUNCTION outing_plan_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revision=OLD.revision THEN NEW.revision:=OLD.revision+1; END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER outing_plan_revision BEFORE UPDATE ON outing_plans FOR EACH ROW EXECUTE FUNCTION outing_plan_revision();
-- +goose StatementBegin
CREATE FUNCTION outing_plan_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM pg_notify('spottr_outing_changes',json_build_object('id',OLD.id,'revision',0)::text);
    RETURN OLD;
  END IF;
  PERFORM pg_notify('spottr_outing_changes',json_build_object('id',NEW.id,'revision',NEW.revision)::text);
  RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER outing_plan_notify AFTER INSERT OR UPDATE OR DELETE ON outing_plans FOR EACH ROW EXECUTE FUNCTION outing_plan_notify();
-- +goose StatementBegin
CREATE FUNCTION outing_child_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID;
BEGIN
  IF TG_OP='DELETE' THEN target:=OLD.plan_id; ELSE target:=NEW.plan_id; END IF;
  UPDATE outing_plans SET revision=revision+1 WHERE id=target;
  RETURN NULL;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER outing_members_changed AFTER INSERT OR UPDATE OR DELETE ON outing_plan_members FOR EACH ROW EXECUTE FUNCTION outing_child_revision();
CREATE TRIGGER outing_options_changed AFTER INSERT OR UPDATE OR DELETE ON outing_plan_options FOR EACH ROW EXECUTE FUNCTION outing_child_revision();
CREATE TRIGGER outing_votes_changed AFTER INSERT OR UPDATE OR DELETE ON outing_plan_votes FOR EACH ROW EXECUTE FUNCTION outing_child_revision();
CREATE TRIGGER outing_dates_changed AFTER INSERT OR UPDATE OR DELETE ON outing_plan_dates FOR EACH ROW EXECUTE FUNCTION outing_child_revision();
CREATE TRIGGER outing_availability_changed AFTER INSERT OR UPDATE OR DELETE ON outing_plan_availability FOR EACH ROW EXECUTE FUNCTION outing_child_revision();
CREATE TRIGGER outing_reactions_changed AFTER INSERT OR UPDATE OR DELETE ON outing_plan_reactions FOR EACH ROW EXECUTE FUNCTION outing_child_revision();
CREATE INDEX outing_decision_deadline_idx ON outing_plans(decision_at) WHERE decision_at IS NOT NULL AND chosen_event_id IS NULL;

-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM outing_plan_availability) OR EXISTS(SELECT 1 FROM outing_plan_members WHERE budget_bani IS NOT NULL OR arrival_status<>'not_set') OR EXISTS(SELECT 1 FROM outing_plans WHERE decision_at IS NOT NULL OR meeting_point IS NOT NULL)
     OR EXISTS(SELECT 1 FROM outing_plan_decisions WHERE reopened_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Refusing to discard outing decisions: roll forward with a compatible API';
  END IF;
END $$;
-- +goose StatementEnd
DROP TRIGGER outing_members_changed ON outing_plan_members;
DROP TRIGGER outing_options_changed ON outing_plan_options;
DROP TRIGGER outing_votes_changed ON outing_plan_votes;
DROP TABLE outing_plan_availability,outing_plan_reactions,outing_plan_dates,outing_plan_decisions;
DROP TRIGGER outing_plan_notify ON outing_plans;
DROP TRIGGER outing_plan_revision ON outing_plans;
DROP FUNCTION outing_child_revision(),outing_plan_notify(),outing_plan_revision();
DROP INDEX outing_decision_deadline_idx;
ALTER TABLE outing_plan_members DROP COLUMN budget_bani,DROP COLUMN arrival_status,DROP COLUMN arrival_updated_at;
ALTER TABLE outing_plans DROP COLUMN revision,DROP COLUMN decision_at,DROP COLUMN deadline_reminded_at,DROP COLUMN deadline_closed_notified_at,
  DROP COLUMN meeting_point,DROP COLUMN meeting_at,DROP COLUMN decision_round,DROP COLUMN reopened_from_revision;
