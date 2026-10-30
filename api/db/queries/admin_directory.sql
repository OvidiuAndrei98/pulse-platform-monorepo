-- name: AdminOrganizerDirectory :many
SELECT op.user_id, op.company_name, op.cui, u.username, u.email,
       op.verification_status, COALESCE(u.is_active, false)::boolean AS account_active,
       op.created_at, op.updated_at,
       CASE WHEN op.stripe_account_id IS NULL THEN 'notConnected'
            WHEN NOT op.stripe_details_submitted THEN 'onboarding'
            WHEN op.stripe_charges_enabled AND op.stripe_payouts_enabled THEN 'active'
            ELSE 'attention' END::text AS stripe_status
FROM organizer_profiles op JOIN users u ON u.id = op.user_id
WHERE (sqlc.arg(status)::text = 'all' OR op.verification_status::text = sqlc.arg(status))
  AND (sqlc.narg(after_id)::uuid IS NULL OR op.user_id > sqlc.narg(after_id))
  AND (sqlc.arg(search)::text = '' OR
       strpos(lower(op.company_name), lower(sqlc.arg(search))) > 0 OR
       strpos(lower(op.cui), lower(sqlc.arg(search))) > 0 OR
       strpos(lower(u.email), lower(sqlc.arg(search))) > 0 OR
       strpos(lower(u.username), lower(sqlc.arg(search))) > 0)
ORDER BY op.user_id LIMIT 26;

-- name: AdminOrganizerDetail :one
SELECT op.user_id, op.company_name, op.cui, u.username, u.email,
       op.fiscal_address, op.verification_status, COALESCE(u.is_active, false)::boolean AS account_active,
       op.created_at, op.updated_at, op.verified_at,
       op.stripe_account_id, op.stripe_charges_enabled, op.stripe_payouts_enabled, op.stripe_details_submitted,
       COALESCE(op.organizer_agreement_version, '')::text AS agreement_version,
       op.organizer_agreement_accepted_at,
       standard.rate_bps AS standard_rate_bps, standard.per_ticket_bani AS standard_per_ticket_bani, standard.revision AS standard_revision,
       override.rate_bps AS custom_rate_bps, override.per_ticket_bani AS custom_per_ticket_bani, COALESCE(override.revision,0)::bigint AS commission_revision,
       (SELECT count(*) FROM events e WHERE e.organizer_id = op.user_id)::bigint AS event_count,
       (SELECT count(*) FROM events e WHERE e.organizer_id = op.user_id AND e.start_time > now() AND e.status IN ('published','scheduled'))::bigint AS upcoming_count,
       (SELECT count(*) FROM orders o JOIN events e ON e.id = o.event_id WHERE e.organizer_id = op.user_id AND o.stripe_refund_needs_attention AND o.stripe_livemode IS TRUE)::bigint AS live_refunds_attention,
       (SELECT count(*) FROM orders o JOIN events e ON e.id = o.event_id WHERE e.organizer_id = op.user_id AND o.stripe_refund_needs_attention AND o.stripe_livemode IS FALSE)::bigint AS test_refunds_attention,
       (SELECT count(*) FROM orders o JOIN events e ON e.id = o.event_id WHERE e.organizer_id = op.user_id AND o.stripe_refund_needs_attention AND o.stripe_livemode IS NULL)::bigint AS unknown_refunds_attention
FROM organizer_profiles op JOIN users u ON u.id = op.user_id
CROSS JOIN platform_commission_settings standard
LEFT JOIN organizer_commission_overrides override ON override.organizer_id = op.user_id
WHERE op.user_id = $1 AND standard.singleton = true;

-- name: AdminOrganizerRecentEvents :many
SELECT id, title, start_time, status, COALESCE(location_name, '')::text AS location_name
FROM events WHERE organizer_id = $1
ORDER BY created_at DESC, id DESC LIMIT 20;
