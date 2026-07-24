-- +goose Up
ALTER TABLE tickets
    ADD COLUMN validated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN validated_by_scanner_access_id UUID REFERENCES event_scanner_access(id) ON DELETE SET NULL;

CREATE INDEX tickets_validated_by_user_id_idx ON tickets(validated_by_user_id);
CREATE INDEX tickets_validated_by_scanner_access_id_idx ON tickets(validated_by_scanner_access_id);

-- +goose Down
DROP INDEX IF EXISTS tickets_validated_by_scanner_access_id_idx;
DROP INDEX IF EXISTS tickets_validated_by_user_id_idx;
ALTER TABLE tickets
    DROP COLUMN IF EXISTS validated_by_scanner_access_id,
    DROP COLUMN IF EXISTS validated_by_user_id;
