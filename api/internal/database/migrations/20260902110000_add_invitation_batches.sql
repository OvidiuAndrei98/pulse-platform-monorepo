-- +goose Up
ALTER TABLE invitation_tickets
    ADD COLUMN batch_id UUID NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN batch_index INTEGER NOT NULL DEFAULT 1 CHECK (batch_index > 0);

CREATE INDEX invitation_tickets_batch_idx
    ON invitation_tickets(event_id, batch_id, batch_index);

-- +goose Down
DROP INDEX IF EXISTS invitation_tickets_batch_idx;
ALTER TABLE invitation_tickets
    DROP COLUMN IF EXISTS batch_index,
    DROP COLUMN IF EXISTS batch_id;
