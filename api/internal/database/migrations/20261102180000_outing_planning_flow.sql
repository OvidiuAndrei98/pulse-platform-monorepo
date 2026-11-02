-- +goose Up
ALTER TABLE outing_plans ADD COLUMN outing_date DATE;
ALTER TABLE outing_plans ADD COLUMN city VARCHAR(80);
ALTER TABLE outing_plans ADD COLUMN request_fingerprint TEXT;
-- Preserve the first proposal as the intended date/city for existing plans.
-- Historical empty plans retain nullable context and are displayed as legacy.
UPDATE outing_plans p SET outing_date=(e.start_time AT TIME ZONE 'Europe/Bucharest')::date,city=e.city
FROM outing_plan_options o JOIN events e ON e.id=o.event_id
WHERE o.plan_id=p.id AND o.position=0;
UPDATE outing_plans SET expires_at=GREATEST(expires_at,(outing_date+2)::timestamp AT TIME ZONE 'Europe/Bucharest') WHERE outing_date IS NOT NULL;
ALTER TABLE outing_plan_options ADD COLUMN proposed_by UUID REFERENCES users(id) ON DELETE SET NULL;
UPDATE outing_plan_options o SET proposed_by=p.owner_id FROM outing_plans p WHERE p.id=o.plan_id;
ALTER TABLE outing_plan_options DROP CONSTRAINT outing_plan_options_position_check;
ALTER TABLE outing_plan_options ADD CONSTRAINT outing_plan_options_position_check CHECK(position BETWEEN 0 AND 7);

-- +goose Down
-- Refuse a lossy rollback if more proposals were added than the older version supports.
-- +goose StatementBegin
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM outing_plan_options WHERE position>3) THEN
    RAISE EXCEPTION 'OUTING_ROLLBACK_WOULD_LOSE_PROPOSALS';
  END IF;
END $$;
-- +goose StatementEnd
ALTER TABLE outing_plan_options DROP CONSTRAINT outing_plan_options_position_check;
ALTER TABLE outing_plan_options ADD CONSTRAINT outing_plan_options_position_check CHECK(position BETWEEN 0 AND 3);
ALTER TABLE outing_plan_options DROP COLUMN proposed_by;
ALTER TABLE outing_plans DROP COLUMN request_fingerprint;
ALTER TABLE outing_plans DROP COLUMN city;
ALTER TABLE outing_plans DROP COLUMN outing_date;
