-- +goose Up
-- Supports deleting expired custody and its audit without scanning all audit rows.
CREATE INDEX wardrobe_audit_deposit ON wardrobe_audit(deposit_id) WHERE deposit_id IS NOT NULL;

-- +goose Down
DROP INDEX wardrobe_audit_deposit;
