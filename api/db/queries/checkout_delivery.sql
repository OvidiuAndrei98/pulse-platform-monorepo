-- name: ClaimTicketEmail :one
UPDATE orders
SET ticket_email_claim = gen_random_uuid(),
    ticket_email_claim_until = clock_timestamp() + interval '2 minutes',
    ticket_email_next_attempt_at = clock_timestamp() + make_interval(secs => LEAST(3600, 15 * power(2, LEAST(ticket_email_attempts, 8)))::double precision),
    ticket_email_attempts = ticket_email_attempts + 1
WHERE id = $1 AND status = 'completed' AND ticket_email_sent_at IS NULL
  AND ticket_email_next_attempt_at <= clock_timestamp()
  AND (ticket_email_claim_until IS NULL OR ticket_email_claim_until <= clock_timestamp())
RETURNING ticket_email_claim;

-- name: CompleteTicketEmailClaim :execrows
UPDATE orders SET ticket_email_sent_at = clock_timestamp(), ticket_email_claim = NULL, ticket_email_claim_until = NULL
WHERE id = $1 AND ticket_email_claim = $2 AND ticket_email_sent_at IS NULL;

-- name: ReleaseTicketEmailClaim :exec
UPDATE orders SET ticket_email_claim = NULL, ticket_email_claim_until = NULL
WHERE id = $1 AND ticket_email_claim = $2;

-- name: ClaimCheckoutForReconciliation :one
WITH candidate AS (
    SELECT id FROM orders
    WHERE status = 'pending' AND stripe_refund_needs_attention IS FALSE
      AND stripe_checkout_session_id IS NOT NULL AND stripe_connected_account_id IS NOT NULL
      AND stripe_charge_type = 'direct'
      AND created_at <= clock_timestamp() - interval '15 seconds'
      AND checkout_reconcile_after <= clock_timestamp()
    ORDER BY checkout_reconcile_after, created_at
    LIMIT 1 FOR UPDATE SKIP LOCKED
)
UPDATE orders SET checkout_reconcile_after = clock_timestamp() + interval '2 minutes'
FROM candidate WHERE orders.id = candidate.id
RETURNING orders.id, orders.stripe_checkout_session_id;
