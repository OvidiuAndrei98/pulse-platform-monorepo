-- +goose Up
-- Additive only: historical event conversations and outing orders are untouched.
CREATE TABLE friend_groups (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
 created_by UUID REFERENCES users(id) ON DELETE SET NULL,
 name VARCHAR(80) NOT NULL,
 request_id UUID NOT NULL,
 request_fingerprint TEXT NOT NULL,
 revision BIGINT NOT NULL DEFAULT 1,
 last_message_seq BIGINT NOT NULL DEFAULT 0,
 activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(created_by,request_id)
);
CREATE TABLE friend_group_members (
 group_id UUID NOT NULL REFERENCES friend_groups(id),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status VARCHAR(16) NOT NULL CHECK(status IN ('pending','accepted','declined','left','removed')),
 invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
 visible_after_seq BIGINT NOT NULL DEFAULT 0,
 joined_at TIMESTAMPTZ,
 read_seq BIGINT NOT NULL DEFAULT 0,
 muted BOOLEAN NOT NULL DEFAULT FALSE,
 PRIMARY KEY(group_id,user_id)
);
CREATE INDEX friend_group_member_user_idx ON friend_group_members(user_id,status);
ALTER TABLE outing_plans ADD COLUMN group_id UUID REFERENCES friend_groups(id);
-- Preserve a private group's history when its final coordinator deletes their
-- account. No new member is fabricated and no historical message is migrated.
ALTER TABLE outing_plans ALTER COLUMN owner_id DROP NOT NULL;
CREATE INDEX friend_group_outings_idx ON outing_plans(group_id,created_at DESC) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX friend_group_outing_request_idx ON outing_plans(group_id,request_id) WHERE group_id IS NOT NULL;
-- Historical, unrelated plans are deliberately not attached to any group.
CREATE UNIQUE INDEX friend_group_night_idx ON outing_plans(group_id,outing_date) WHERE group_id IS NOT NULL AND outing_date IS NOT NULL;
CREATE TABLE friend_group_messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id UUID NOT NULL REFERENCES friend_groups(id),
 sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
 request_id UUID NOT NULL,
 seq BIGINT NOT NULL,
 content VARCHAR(2000) NOT NULL DEFAULT '',
 event_id UUID REFERENCES events(id) ON DELETE SET NULL,
 outing_id UUID REFERENCES outing_plans(id) ON DELETE SET NULL,
 kind VARCHAR(16) NOT NULL CHECK(kind IN ('text','event','outing')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(group_id,seq), UNIQUE(group_id,sender_id,request_id)
);
CREATE INDEX friend_group_message_event_idx ON friend_group_messages(group_id,event_id,seq DESC)
 WHERE kind='event' AND event_id IS NOT NULL;
CREATE TABLE outing_attendance (
 plan_id UUID NOT NULL REFERENCES outing_plans(id),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 decision_round INTEGER NOT NULL,
 answer VARCHAR(8) NOT NULL CHECK(answer IN ('yes','maybe','no')),
 responded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(plan_id,user_id,decision_round)
);
ALTER TABLE notifications ADD COLUMN friend_group_id UUID REFERENCES friend_groups(id);
ALTER TABLE notifications ADD COLUMN outing_plan_id UUID REFERENCES outing_plans(id);
CREATE INDEX friend_group_unread_notification_idx ON notifications(friend_group_id,user_id)
 WHERE friend_group_id IS NOT NULL AND read_at IS NULL;
ALTER TABLE outing_plans ADD COLUMN destination_start_time TIMESTAMPTZ;
ALTER TABLE outing_plans ADD COLUMN destination_location TEXT;
-- Material event edits require a new personal attendance response. A title edit
-- does not. The actual event end, never midnight, controls outing completion.
-- +goose StatementBegin
CREATE FUNCTION friend_group_event_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target RECORD;
BEGIN
 FOR target IN SELECT id,group_id,decision_round,destination_start_time,destination_location FROM outing_plans
  WHERE group_id IS NOT NULL AND chosen_event_id=NEW.id FOR UPDATE LOOP
  IF OLD.start_time IS DISTINCT FROM NEW.start_time OR OLD.location_name IS DISTINCT FROM NEW.location_name THEN
   UPDATE outing_plan_decisions SET reopened_at=CURRENT_TIMESTAMP,reopen_reason='other'
    WHERE plan_id=target.id AND round=target.decision_round;
   UPDATE outing_plans SET decision_round=decision_round+1,destination_start_time=NEW.start_time,
    destination_location=NEW.location_name,expires_at=NEW.end_time WHERE id=target.id;
   INSERT INTO outing_plan_decisions(plan_id,round,event_id) VALUES(target.id,target.decision_round+1,NEW.id);
  ELSIF OLD.end_time IS DISTINCT FROM NEW.end_time THEN
   UPDATE outing_plans SET expires_at=NEW.end_time WHERE id=target.id;
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status='cancelled'
    OR OLD.start_time IS DISTINCT FROM NEW.start_time OR OLD.location_name IS DISTINCT FROM NEW.location_name THEN
   INSERT INTO notifications(user_id,type,title,body,event_id,friend_group_id,outing_plan_id)
    SELECT user_id,CASE WHEN NEW.status='cancelled' THEN 'friend_group_cancelled' ELSE 'friend_group_changed' END,
     'Your outing changed','Open your group for the latest event details.',NEW.id,target.group_id,target.id
    FROM friend_group_members WHERE group_id=target.group_id AND status='accepted' AND NOT muted;
  END IF;
 END LOOP;
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER friend_group_event_changed AFTER UPDATE OF start_time,end_time,location_name,status ON events FOR EACH ROW EXECUTE FUNCTION friend_group_event_changed();
-- Account deletion must revoke membership without blocking the independent
-- deletion flow, or stranding an active group without an administrator.
-- +goose StatementBegin
CREATE FUNCTION friend_group_account_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE successor UUID; target RECORD;
BEGIN
 FOR target IN SELECT id FROM friend_groups WHERE owner_id=OLD.id LOOP
  SELECT user_id INTO successor FROM friend_group_members m JOIN users u ON u.id=m.user_id AND u.is_active
   WHERE m.group_id=target.id AND m.status='accepted' AND m.user_id<>OLD.id ORDER BY m.joined_at,m.user_id LIMIT 1;
  UPDATE friend_groups SET owner_id=successor,revision=revision+1 WHERE id=target.id;
 END LOOP;
 UPDATE outing_plans p SET owner_id=g.owner_id FROM friend_groups g
  WHERE p.group_id=g.id AND p.owner_id=OLD.id;
 -- An invitation from a deleted inviter cannot be accepted later. A current
 -- administrator may explicitly invite an eligible friend again.
 UPDATE friend_group_members SET status='removed' WHERE invited_by=OLD.id AND status='pending';
 DELETE FROM notifications n USING friend_group_members m
  WHERE n.friend_group_id=m.group_id AND n.user_id=m.user_id AND n.type='friend_group_invite'
   AND m.invited_by=OLD.id AND m.status='removed';
 RETURN OLD;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER friend_group_account_deleted BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION friend_group_account_deleted();
-- Protect against an older API recreating the retired product after rollback.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION reject_retired_event_chat() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'EVENT_CHAT_RETIRED'; END;
$$;
-- +goose StatementEnd
DROP TRIGGER IF EXISTS retired_event_chat ON event_safety_groups;
DROP TRIGGER IF EXISTS retired_event_chat ON event_safety_group_members;
DROP TRIGGER IF EXISTS retired_event_chat ON event_safety_messages;
CREATE TRIGGER retired_event_chat BEFORE INSERT OR UPDATE ON event_safety_groups FOR EACH ROW EXECUTE FUNCTION reject_retired_event_chat();
CREATE TRIGGER retired_event_chat BEFORE INSERT OR UPDATE ON event_safety_group_members FOR EACH ROW EXECUTE FUNCTION reject_retired_event_chat();
CREATE TRIGGER retired_event_chat BEFORE INSERT OR UPDATE ON event_safety_messages FOR EACH ROW EXECUTE FUNCTION reject_retired_event_chat();

-- +goose Down
-- Never silently discard private conversations, invitations or attendance.
-- +goose StatementBegin
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM friend_groups) THEN
  RAISE EXCEPTION 'PERMANENT_GROUPS_ROLLBACK_REQUIRES_ARCHIVE';
 END IF;
END $$;
-- +goose StatementEnd
ALTER TABLE notifications DROP COLUMN outing_plan_id, DROP COLUMN friend_group_id;
DROP TRIGGER friend_group_event_changed ON events;
DROP FUNCTION friend_group_event_changed();
DROP TRIGGER friend_group_account_deleted ON users;
DROP FUNCTION friend_group_account_deleted();
DROP TABLE outing_attendance,friend_group_messages;
ALTER TABLE outing_plans DROP COLUMN group_id;
ALTER TABLE outing_plans ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE outing_plans DROP COLUMN destination_start_time,DROP COLUMN destination_location;
DROP TABLE friend_group_members,friend_groups;
-- Retirement guards intentionally survive rollback. Restoring the old chat
-- requires a separate, explicitly reviewed product/data decision.
