-- +goose Up
-- Preserve the VAT selection at purchase. Historical
-- invoices cannot be reconstructed from today's settings, so remain unknown.
ALTER TABLE orders
    ADD COLUMN ticket_vat_percentage NUMERIC(5,2)
        CHECK (ticket_vat_percentage >= 0 AND ticket_vat_percentage <= 100),
    ADD COLUMN ticket_vat_name VARCHAR(64);

-- +goose Down
ALTER TABLE orders DROP COLUMN ticket_vat_name, DROP COLUMN ticket_vat_percentage;
