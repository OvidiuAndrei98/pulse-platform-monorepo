-- +goose Up
ALTER TABLE orders
    ADD COLUMN stripe_checkout_session_id VARCHAR(255) UNIQUE,
    ADD COLUMN platform_fee_bani INT NOT NULL DEFAULT 0;

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price_ron INT NOT NULL CHECK (unit_price_ron >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (order_id, ticket_type_id)
);

CREATE INDEX order_items_order_id_idx ON order_items(order_id);

-- +goose Down
DROP INDEX IF EXISTS order_items_order_id_idx;
DROP TABLE IF EXISTS order_items;

ALTER TABLE orders
    DROP COLUMN IF EXISTS platform_fee_bani,
    DROP COLUMN IF EXISTS stripe_checkout_session_id;
