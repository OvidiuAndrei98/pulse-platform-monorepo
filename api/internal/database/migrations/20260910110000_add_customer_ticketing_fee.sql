-- +goose Up
ALTER TABLE orders
    ADD COLUMN customer_ticketing_fee_bani INT NOT NULL DEFAULT 0
        CHECK (customer_ticketing_fee_bani >= 0);

-- Existing checkout orders did not snapshot who covered the platform fee.
-- Completed events are read-only, so the event setting is the best available
-- source for backfilling invoices that have not been issued yet.
UPDATE orders AS order_record
SET customer_ticketing_fee_bani = order_record.platform_fee_bani
FROM events
WHERE events.id = order_record.event_id
  AND events.organizer_absorbs_service_fee = FALSE
  AND order_record.platform_fee_bani > 0;

-- +goose Down
ALTER TABLE orders
    DROP COLUMN IF EXISTS customer_ticketing_fee_bani;
