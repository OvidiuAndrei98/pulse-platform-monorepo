-- name: GetOrganizerInvoicingSettings :one
SELECT *
FROM organizer_invoicing_settings
WHERE organizer_id = $1;

-- name: UpsertOrganizerInvoicingSettings :one
INSERT INTO organizer_invoicing_settings (
    organizer_id, provider, enabled, account_email, credentials_encrypted,
    company_vat_code, series_name, vat_name, vat_percentage, send_email, send_to_spv
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (organizer_id) DO UPDATE SET
    provider = EXCLUDED.provider,
    enabled = EXCLUDED.enabled,
    account_email = EXCLUDED.account_email,
    credentials_encrypted = EXCLUDED.credentials_encrypted,
    company_vat_code = EXCLUDED.company_vat_code,
    series_name = EXCLUDED.series_name,
    vat_name = EXCLUDED.vat_name,
    vat_percentage = EXCLUDED.vat_percentage,
    send_email = EXCLUDED.send_email,
    send_to_spv = EXCLUDED.send_to_spv,
    updated_at = CURRENT_TIMESTAMP
RETURNING *;

-- name: DeleteOrganizerInvoicingSettings :execrows
DELETE FROM organizer_invoicing_settings
WHERE organizer_id = $1;

-- name: CreateBillingInvoiceForOrder :one
INSERT INTO billing_invoices (order_id, organizer_id, provider)
SELECT o.id, e.organizer_id, settings.provider
FROM orders o
JOIN events e ON e.id = o.event_id
JOIN organizer_invoicing_settings settings ON settings.organizer_id = e.organizer_id
WHERE o.id = $1
  AND o.status = 'completed'
  AND o.stripe_livemode IS TRUE
  AND settings.enabled = TRUE
ON CONFLICT (order_id) DO UPDATE
SET updated_at = billing_invoices.updated_at
RETURNING *;

-- name: BackfillBillingInvoices :execrows
INSERT INTO billing_invoices (order_id, organizer_id, provider)
SELECT o.id, e.organizer_id, settings.provider
FROM orders o
JOIN events e ON e.id = o.event_id
JOIN organizer_invoicing_settings settings ON settings.organizer_id = e.organizer_id
LEFT JOIN billing_invoices invoice ON invoice.order_id = o.id
WHERE o.status = 'completed'
  AND o.stripe_livemode IS TRUE
  AND settings.enabled = TRUE
  AND invoice.id IS NULL
ON CONFLICT (order_id) DO NOTHING;

-- name: BackfillBillingInvoiceRefunds :execrows
INSERT INTO billing_invoice_refunds (
    billing_invoice_id, order_id, organizer_id, provider
)
SELECT invoice.id, invoice.order_id, invoice.organizer_id, invoice.provider
FROM billing_invoices invoice
JOIN orders ON orders.id = invoice.order_id
LEFT JOIN billing_invoice_refunds refund ON refund.order_id = invoice.order_id
WHERE invoice.status = 'issued'
  AND orders.status = 'refunded'
  AND orders.automatic_invoice_refund_enabled = TRUE
  AND refund.id IS NULL
ON CONFLICT (order_id) DO NOTHING;

-- name: DeleteUnissuedBillingInvoicesForRefundedOrders :execrows
DELETE FROM billing_invoices invoice
USING orders
WHERE orders.id = invoice.order_id
  AND orders.status = 'refunded'
  AND invoice.status IN ('pending', 'failed', 'needs_review')
  AND NOT EXISTS (SELECT 1 FROM invoice_service_usage usage WHERE usage.invoice_id=invoice.id AND usage.state IN ('dispatching','needs_review','issued'));

-- name: ClaimBillingInvoices :many
WITH claimable AS (
    SELECT id
    FROM billing_invoices
    WHERE attempt_count < 8
      AND EXISTS (SELECT 1 FROM organizer_invoicing_settings settings
                  WHERE settings.organizer_id=billing_invoices.organizer_id AND settings.enabled=TRUE)
      AND (
        (status IN ('pending', 'failed') AND next_attempt_at <= CURRENT_TIMESTAMP)
        OR (status = 'processing' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes')
      )
    ORDER BY next_attempt_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT sqlc.arg(batch_size)
)
UPDATE billing_invoices invoice
SET status = 'processing',
    claim_token = gen_random_uuid(),
    attempt_count = attempt_count + 1,
    error_message = NULL,
    updated_at = CURRENT_TIMESTAMP
FROM claimable
WHERE invoice.id = claimable.id
RETURNING invoice.*;

-- name: GetBillingInvoiceIssueData :one
SELECT invoice.id AS invoice_id,
       invoice.order_id,
       invoice.organizer_id,
       invoice.provider,
       invoice.attempt_count,
       orders.email,
       orders.total_amount,
       orders.customer_ticketing_fee_bani,
       orders.stripe_livemode,
       orders.stripe_payment_intent_id,
       orders.status AS order_status,
       orders.billing_type,
       orders.billing_name,
       orders.billing_tax_id,
       orders.billing_registration_number,
       orders.billing_address,
       orders.billing_city,
       orders.billing_county,
       orders.billing_sector,
       orders.billing_country,
       orders.created_at AS order_created_at,
       events.title AS event_title,
       profile.company_name AS organizer_company_name,
       profile.cui AS organizer_cui,
       settings.account_email,
       settings.credentials_encrypted,
       settings.company_vat_code,
       settings.series_name,
       COALESCE(orders.ticket_vat_name,
           CASE WHEN orders.ticket_vat_percentage IS NULL OR orders.ticket_vat_percentage = settings.vat_percentage THEN settings.vat_name END, '')::TEXT AS vat_name,
       COALESCE(orders.ticket_vat_percentage, settings.vat_percentage)::NUMERIC AS vat_percentage,
       settings.send_email,
       settings.send_to_spv,
       settings.enabled AS integration_enabled,
       settings.provider AS configured_provider
FROM billing_invoices invoice
JOIN orders ON orders.id = invoice.order_id
JOIN events ON events.id = orders.event_id
JOIN organizer_profiles profile ON profile.user_id = invoice.organizer_id
JOIN organizer_invoicing_settings settings ON settings.organizer_id = invoice.organizer_id
WHERE invoice.id = $1;

-- name: DeleteUnissuedBillingInvoiceForRefund :execrows
DELETE FROM billing_invoices
WHERE order_id = $1
  AND status IN ('pending', 'failed', 'needs_review')
  AND NOT EXISTS (SELECT 1 FROM invoice_service_usage usage WHERE usage.invoice_id=billing_invoices.id AND usage.state IN ('dispatching','needs_review','issued'));

-- name: SnapshotOrderInvoiceVAT :exec
UPDATE orders
SET ticket_vat_percentage = COALESCE(ticket_vat_percentage, sqlc.arg(vat_percentage)::NUMERIC),
    ticket_vat_name = COALESCE(ticket_vat_name, sqlc.arg(vat_name)::TEXT)
WHERE id = sqlc.arg(order_id);

-- name: DeleteClaimedBillingInvoice :execrows
DELETE FROM billing_invoices
WHERE id = $1 AND status = 'processing';

-- name: ListBillingInvoiceItems :many
SELECT items.ticket_type_id,
       ticket_types.name AS ticket_type_name,
       items.quantity,
       items.unit_price_ron
FROM order_items items
JOIN ticket_types ON ticket_types.id = items.ticket_type_id
WHERE items.order_id = $1
ORDER BY items.created_at ASC;

-- name: MarkBillingInvoiceIssued :one
UPDATE billing_invoices
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

-- name: MarkBillingInvoiceFailed :one
UPDATE billing_invoices
SET status = CASE WHEN sqlc.arg(needs_review)::BOOLEAN THEN 'needs_review' ELSE 'failed' END,
    error_message = sqlc.arg(error_message),
    next_attempt_at = CURRENT_TIMESTAMP + make_interval(secs => sqlc.arg(retry_seconds)::INT),
    updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id)
RETURNING *;

-- name: ListOrganizerBillingInvoices :many
SELECT invoice.id,
       invoice.order_id,
       invoice.provider,
       invoice.status,
       invoice.attempt_count,
       invoice.external_series,
       invoice.external_number,
       invoice.document_url,
       invoice.error_message,
       invoice.issued_at,
       invoice.created_at,
       refund.status AS refund_status,
       refund.external_series AS refund_external_series,
       refund.external_number AS refund_external_number,
       refund.document_url AS refund_document_url,
       refund.error_message AS refund_error_message,
       orders.email,
       orders.billing_name,
       orders.total_amount,
       events.title AS event_title
FROM billing_invoices invoice
JOIN orders ON orders.id = invoice.order_id
JOIN events ON events.id = orders.event_id
LEFT JOIN billing_invoice_refunds refund ON refund.billing_invoice_id = invoice.id
WHERE invoice.organizer_id = $1
ORDER BY invoice.created_at DESC
LIMIT 100;

-- name: RetryBillingInvoice :one
UPDATE billing_invoices
SET status = 'pending',
    attempt_count = 0,
    next_attempt_at = CURRENT_TIMESTAMP,
    error_message = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE billing_invoices.id = $1
  AND billing_invoices.organizer_id = $2
  AND billing_invoices.status IN ('failed', 'needs_review')
  AND NOT EXISTS (SELECT 1 FROM invoice_service_usage usage
                  WHERE usage.invoice_id=billing_invoices.id AND usage.state IN ('dispatching','needs_review','issued'))
RETURNING *;

-- name: CreateBillingInvoiceRefundForOrder :one
INSERT INTO billing_invoice_refunds (
    billing_invoice_id, order_id, organizer_id, provider
)
SELECT invoice.id, invoice.order_id, invoice.organizer_id, invoice.provider
FROM billing_invoices invoice
JOIN orders ON orders.id = invoice.order_id
WHERE invoice.order_id = $1
  AND invoice.status = 'issued'
  AND orders.status = 'refunded'
  AND orders.automatic_invoice_refund_enabled = TRUE
ON CONFLICT (order_id) DO UPDATE
SET updated_at = billing_invoice_refunds.updated_at
RETURNING *;

-- name: ClaimBillingInvoiceRefunds :many
WITH claimable AS (
    SELECT id
    FROM billing_invoice_refunds
    WHERE attempt_count < 8
      AND (
        (status IN ('pending', 'failed') AND next_attempt_at <= CURRENT_TIMESTAMP)
        OR (status = 'processing' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes')
      )
    ORDER BY next_attempt_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT sqlc.arg(batch_size)
)
UPDATE billing_invoice_refunds refund
SET status = 'processing',
    attempt_count = attempt_count + 1,
    error_message = NULL,
    updated_at = CURRENT_TIMESTAMP
FROM claimable
WHERE refund.id = claimable.id
RETURNING refund.*;

-- name: GetBillingInvoiceRefundIssueData :one
SELECT refund.id,
       refund.order_id,
       refund.organizer_id,
       refund.provider,
       refund.attempt_count,
       invoice.external_series AS original_series,
       invoice.external_number AS original_number,
       settings.account_email,
       settings.credentials_encrypted,
       settings.company_vat_code,
       settings.series_name,
       settings.enabled AS integration_enabled,
       settings.provider AS configured_provider
FROM billing_invoice_refunds refund
JOIN billing_invoices invoice ON invoice.id = refund.billing_invoice_id
JOIN organizer_invoicing_settings settings ON settings.organizer_id = refund.organizer_id
JOIN orders ON orders.id = refund.order_id
WHERE refund.id = $1
  AND orders.status = 'refunded';

-- name: MarkBillingInvoiceRefundIssued :one
UPDATE billing_invoice_refunds
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

-- name: MarkBillingInvoiceRefundFailed :one
UPDATE billing_invoice_refunds
SET status = CASE WHEN sqlc.arg(needs_review)::BOOLEAN THEN 'needs_review' ELSE 'failed' END,
    error_message = sqlc.arg(error_message),
    next_attempt_at = CURRENT_TIMESTAMP + make_interval(secs => sqlc.arg(retry_seconds)::INT),
    updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id)
RETURNING *;

-- name: RetryBillingInvoiceRefund :one
UPDATE billing_invoice_refunds
SET status = 'pending',
    attempt_count = 0,
    next_attempt_at = CURRENT_TIMESTAMP,
    error_message = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE billing_invoice_id = sqlc.arg(billing_invoice_id)
  AND organizer_id = sqlc.arg(organizer_id)
  AND status IN ('failed', 'needs_review')
RETURNING *;
