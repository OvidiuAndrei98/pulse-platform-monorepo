-- +goose Up
-- Remove the old quota-only block. Never retry a provider call whose outcome
-- is uncertain, or change an organizer's saved enabled/disabled preference.
UPDATE billing_invoices invoice
SET status='pending', attempt_count=0, next_attempt_at=CURRENT_TIMESTAMP,
    error_message=NULL, updated_at=CURRENT_TIMESTAMP
WHERE invoice.status='needs_review'
  AND invoice.error_message='Comanda precede activarea serviciului platit. Emite factura manual; nu a fost retinuta taxa de facturare.'
  AND NOT EXISTS (
      SELECT 1 FROM invoice_service_usage usage
      WHERE usage.invoice_id=invoice.id
        AND usage.state IN ('dispatching','needs_review','issued')
  );

-- Historical consent and fee records remain available for reconciliation.
-- No new checkout or invoice consults the lifetime allowance or paid flag.

-- +goose Down
-- Intentionally do not restore the quota or re-block invoices.
SELECT 1;
