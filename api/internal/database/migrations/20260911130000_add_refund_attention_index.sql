-- +goose Up
CREATE INDEX orders_refund_attention_idx
    ON orders (stripe_refund_updated_at DESC, event_id)
    WHERE stripe_refund_needs_attention IS TRUE;

-- +goose Down
DROP INDEX IF EXISTS orders_refund_attention_idx;
