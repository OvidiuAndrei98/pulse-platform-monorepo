-- +goose Up
-- Set the current standard for new orders. Inherited organizer commissions
-- follow this row; negotiated overrides and existing order snapshots stay intact.
-- The audit trigger records the previous standard and this migration's change.
UPDATE platform_commission_settings
SET rate_bps = 500,
    per_ticket_bani = 150,
    revision = revision + 1,
    updated_by = NULL,
    updated_at = now()
WHERE singleton = true
  AND (rate_bps, per_ticket_bani) IS DISTINCT FROM (500, 150);

-- +goose Down
-- Pricing is an administrative setting, not a schema change. An application
-- rollback must not overwrite subsequent pricing decisions. Use the admin
-- commission controls to change the standard explicitly if required.
SELECT 1;
