-- +goose Up
CREATE INDEX orders_completed_guest_email_idx
ON orders (LOWER(email))
WHERE user_id IS NULL AND status = 'completed';

-- +goose Down
DROP INDEX IF EXISTS orders_completed_guest_email_idx;
