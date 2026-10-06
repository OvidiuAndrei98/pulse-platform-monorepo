-- +goose Up
CREATE TABLE checkout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_hash BYTEA NOT NULL,
    request_key UUID NOT NULL,
    request_hash BYTEA NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (subject_hash, request_key)
);
CREATE INDEX checkout_requests_order_idx ON checkout_requests (order_id);

-- +goose Down
DROP TABLE checkout_requests;
