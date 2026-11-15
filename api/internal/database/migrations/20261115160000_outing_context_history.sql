-- +goose Up
-- A context correction resets current answers, while retaining their old
-- meaning privately. This table is never part of a public group projection.
CREATE TABLE outing_plan_context_history (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_id UUID NOT NULL REFERENCES outing_plans(id) ON DELETE CASCADE,
 actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
 from_revision BIGINT NOT NULL,
 request_fingerprint TEXT NOT NULL,
 snapshot JSONB NOT NULL,
 changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(plan_id,from_revision)
);

-- +goose Down
-- Held through Goose's migration transaction: an archive insert cannot race
-- between the empty check and DROP.
LOCK TABLE outing_plan_context_history IN ACCESS EXCLUSIVE MODE;
-- +goose StatementBegin
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM outing_plan_context_history) THEN
  RAISE EXCEPTION 'OUTING_CONTEXT_ROLLBACK_REQUIRES_ARCHIVE';
 END IF;
END $$;
-- +goose StatementEnd
DROP TABLE outing_plan_context_history;
