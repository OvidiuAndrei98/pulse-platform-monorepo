-- name: CreateMonthlyPlatformCommissionInvoices :execrows
INSERT INTO platform_commission_invoices (
    organizer_id, period_start, period_end, provider, transaction_count, total_fee_bani
)
SELECT events.organizer_id,
       (sqlc.arg(period_start_at)::TIMESTAMPTZ AT TIME ZONE 'Europe/Bucharest')::DATE,
       (sqlc.arg(period_end_at)::TIMESTAMPTZ AT TIME ZONE 'Europe/Bucharest')::DATE,
       sqlc.arg(provider),
       COUNT(orders.id)::INT,
       SUM(orders.platform_fee_bani)::BIGINT
FROM orders
JOIN events ON events.id = orders.event_id
JOIN organizer_profiles profile ON profile.user_id = events.organizer_id
WHERE orders.status = 'completed'
  AND orders.stripe_livemode IS TRUE
  AND orders.platform_fee_bani > 0
  AND COALESCE(orders.completed_at, orders.created_at) >= sqlc.arg(period_start_at)::TIMESTAMPTZ
  AND COALESCE(orders.completed_at, orders.created_at) < sqlc.arg(period_end_at)::TIMESTAMPTZ
  AND profile.verification_status = 'approved'
GROUP BY events.organizer_id
ON CONFLICT (organizer_id, period_start) DO NOTHING;

-- name: ClaimPlatformCommissionInvoices :many
WITH claimable AS (
    SELECT id
    FROM platform_commission_invoices
    WHERE attempt_count < 8
      AND (
        (status IN ('pending', 'failed') AND next_attempt_at <= CURRENT_TIMESTAMP)
        OR (status = 'processing' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes')
      )
    ORDER BY next_attempt_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT sqlc.arg(batch_size)
)
UPDATE platform_commission_invoices invoice
SET status = 'processing',
    attempt_count = attempt_count + 1,
    error_message = NULL,
    updated_at = CURRENT_TIMESTAMP
FROM claimable
WHERE invoice.id = claimable.id
RETURNING invoice.*;

-- name: GetPlatformCommissionInvoiceIssueData :one
SELECT invoice.id,
       invoice.organizer_id,
       invoice.provider,
       invoice.period_start,
       invoice.period_end,
       invoice.transaction_count,
       invoice.total_fee_bani,
       invoice.attempt_count,
       users.email AS organizer_email,
       profile.company_name,
       profile.cui,
       profile.fiscal_address
FROM platform_commission_invoices invoice
JOIN organizer_profiles profile ON profile.user_id = invoice.organizer_id
JOIN users ON users.id = invoice.organizer_id
WHERE invoice.id = $1;

-- name: GetPlatformCommissionInvoiceLiveTotals :one
SELECT COUNT(orders.id)::INT AS transaction_count,
       COALESCE(SUM(orders.platform_fee_bani), 0)::BIGINT AS total_fee_bani
FROM orders
JOIN events ON events.id = orders.event_id
WHERE events.organizer_id = sqlc.arg(organizer_id)
  AND orders.status = 'completed'
  AND orders.stripe_livemode IS TRUE
  AND orders.platform_fee_bani > 0
  AND COALESCE(orders.completed_at, orders.created_at) >=
      (sqlc.arg(period_start)::DATE::TIMESTAMP AT TIME ZONE 'Europe/Bucharest')
  AND COALESCE(orders.completed_at, orders.created_at) <
      (sqlc.arg(period_end)::DATE::TIMESTAMP AT TIME ZONE 'Europe/Bucharest');

-- name: UpdatePlatformCommissionInvoiceTotals :exec
UPDATE platform_commission_invoices
SET transaction_count = sqlc.arg(transaction_count),
    total_fee_bani = sqlc.arg(total_fee_bani),
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: MarkPlatformCommissionInvoiceIssued :one
UPDATE platform_commission_invoices
SET status = 'issued',
    external_series = $2,
    external_number = $3,
    external_document_id = $4,
    document_url = $5,
    error_message = NULL,
    issued_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;

-- name: MarkPlatformCommissionInvoiceFailed :one
UPDATE platform_commission_invoices
SET status = CASE WHEN sqlc.arg(needs_review)::BOOLEAN THEN 'needs_review' ELSE 'failed' END,
    error_message = sqlc.arg(error_message),
    next_attempt_at = CURRENT_TIMESTAMP + make_interval(secs => sqlc.arg(retry_seconds)::INT),
    updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id)
RETURNING *;

-- name: ListOrganizerPlatformCommissionInvoices :many
SELECT id,
       provider,
       status,
       transaction_count,
       total_fee_bani,
       external_series,
       external_number,
       document_url,
       error_message,
       period_start,
       period_end,
       issued_at,
       created_at
FROM platform_commission_invoices
WHERE organizer_id = $1
ORDER BY period_start DESC
LIMIT 100;
