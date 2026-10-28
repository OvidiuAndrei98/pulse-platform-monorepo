-- name: GetStandardCommission :one
SELECT * FROM platform_commission_settings WHERE singleton = true;

-- name: UpdateStandardCommission :one
UPDATE platform_commission_settings SET rate_bps = $1, per_ticket_bani = $2,
    updated_by = $3, updated_at = now(), revision = revision + 1
WHERE singleton = true AND revision = $4 RETURNING *;

-- name: ListOrganizerCommissions :many
SELECT op.user_id AS organizer_id, op.company_name, u.email,
    o.rate_bps AS custom_rate_bps, o.per_ticket_bani AS custom_per_ticket_bani,
    COALESCE(o.revision, 0)::bigint AS revision
FROM organizer_profiles op JOIN users u ON u.id = op.user_id
LEFT JOIN organizer_commission_overrides o ON o.organizer_id = op.user_id
ORDER BY lower(op.company_name), op.user_id;

-- name: SetOrganizerCommission :one
INSERT INTO organizer_commission_overrides (organizer_id, rate_bps, per_ticket_bani, updated_by)
SELECT sqlc.arg(organizer_id)::uuid, sqlc.narg(rate_bps)::integer,
       sqlc.narg(per_ticket_bani)::integer, sqlc.arg(updated_by)::uuid
WHERE sqlc.arg(expected_revision)::bigint = 0 OR EXISTS (
    SELECT 1 FROM organizer_commission_overrides WHERE organizer_id = sqlc.arg(organizer_id)
)
ON CONFLICT (organizer_id) DO UPDATE SET
    rate_bps = EXCLUDED.rate_bps, per_ticket_bani = EXCLUDED.per_ticket_bani,
    updated_by = EXCLUDED.updated_by, updated_at = now(),
    revision = organizer_commission_overrides.revision + 1
WHERE organizer_commission_overrides.revision = sqlc.arg(expected_revision)
RETURNING *;

-- name: GetEffectiveCommission :one
SELECT rate_bps, per_ticket_bani FROM effective_organizer_commissions WHERE organizer_id = $1;
