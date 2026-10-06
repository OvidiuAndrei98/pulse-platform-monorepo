-- +goose Up
ALTER TABLE orders
    ADD COLUMN ticket_email_claim UUID,
    ADD COLUMN ticket_email_claim_until TIMESTAMPTZ,
    ADD COLUMN ticket_email_next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN ticket_email_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN checkout_reconcile_after TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX orders_ticket_email_due_idx ON orders (ticket_email_next_attempt_at, id)
    WHERE status = 'completed' AND ticket_email_sent_at IS NULL;
CREATE INDEX orders_checkout_reconcile_due_idx ON orders (checkout_reconcile_after, created_at)
    WHERE status = 'pending' AND stripe_refund_needs_attention IS FALSE
      AND stripe_checkout_session_id IS NOT NULL AND stripe_connected_account_id IS NOT NULL
      AND stripe_charge_type = 'direct';

-- +goose Down
DROP INDEX orders_checkout_reconcile_due_idx;
DROP INDEX orders_ticket_email_due_idx;
ALTER TABLE orders DROP COLUMN checkout_reconcile_after, DROP COLUMN ticket_email_attempts,
    DROP COLUMN ticket_email_next_attempt_at, DROP COLUMN ticket_email_claim_until,
    DROP COLUMN ticket_email_claim;
