-- +goose Up
CREATE INDEX tickets_scan_history_idx
    ON tickets (ticket_type_id, validated_at DESC, id DESC)
    INCLUDE (validated_by_user_id, validated_by_scanner_access_id)
    WHERE is_validated = TRUE AND validated_at IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS tickets_scan_history_idx;
