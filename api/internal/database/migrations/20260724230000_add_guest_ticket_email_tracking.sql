-- +goose Up
ALTER TABLE orders
ADD COLUMN ticket_email_sent_at TIMESTAMP WITH TIME ZONE;

-- +goose Down
ALTER TABLE orders
DROP COLUMN IF EXISTS ticket_email_sent_at;
