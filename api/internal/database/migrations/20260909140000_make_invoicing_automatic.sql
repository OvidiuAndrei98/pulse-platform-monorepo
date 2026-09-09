-- +goose Up
ALTER TABLE orders
    ALTER COLUMN invoice_requested SET DEFAULT TRUE,
    ADD COLUMN billing_sector VARCHAR(16) NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE orders
    DROP COLUMN IF EXISTS billing_sector,
    ALTER COLUMN invoice_requested SET DEFAULT FALSE;
