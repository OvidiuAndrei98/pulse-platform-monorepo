-- +goose Up
-- Preserve which question an outing message introduced. Old messages remain
-- valid history, but are not retroactively assigned a made-up current context.
ALTER TABLE friend_group_messages ADD COLUMN outing_context JSONB;

-- +goose Down
ALTER TABLE friend_group_messages DROP COLUMN outing_context;
