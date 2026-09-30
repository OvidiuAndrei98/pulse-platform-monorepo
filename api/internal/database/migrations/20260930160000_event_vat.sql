-- +goose Up
-- NULL is deliberately unconfigured, not equivalent to a non-VAT collector.
-- Existing orders keep their own historical snapshots.
ALTER TABLE events ADD COLUMN vat_percentage NUMERIC(5,2)
    CHECK (vat_percentage >= 0 AND vat_percentage <= 100);

CREATE TABLE stripe_event_vat_rates (
    connected_account_id TEXT NOT NULL,
    livemode BOOLEAN NOT NULL,
    percentage NUMERIC(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
    stripe_tax_rate_id TEXT NOT NULL,
    PRIMARY KEY (connected_account_id, livemode, percentage)
);

-- +goose Down
DROP TABLE stripe_event_vat_rates;
ALTER TABLE events DROP COLUMN vat_percentage;
