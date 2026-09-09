-- name: CreateOrganizerProfile :one
INSERT INTO organizer_profiles (
    user_id, cui, company_name, fiscal_address, is_verified, verified_at, verification_status,
    organizer_agreement_version, organizer_agreement_accepted_at, organizer_agreement_accepted_ip
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (user_id) DO UPDATE 
SET 
    cui = EXCLUDED.cui, 
    company_name = EXCLUDED.company_name, 
    fiscal_address = EXCLUDED.fiscal_address, 
    is_verified = EXCLUDED.is_verified, 
    verified_at = EXCLUDED.verified_at,
    verification_status = EXCLUDED.verification_status,
    organizer_agreement_version = EXCLUDED.organizer_agreement_version,
    organizer_agreement_accepted_at = EXCLUDED.organizer_agreement_accepted_at,
    organizer_agreement_accepted_ip = EXCLUDED.organizer_agreement_accepted_ip
RETURNING *;

-- name: GetOrganizerProfile :one
SELECT * FROM organizer_profiles WHERE user_id = $1 LIMIT 1;

-- name: GetOrganizerByCUI :one
SELECT * FROM organizer_profiles WHERE cui = $1 LIMIT 1;

-- name: CreatePendingOrganizerProfile :exec
INSERT INTO organizer_profiles (
    user_id, cui, company_name, fiscal_address, is_verified, verified_at, verification_status
)
VALUES ($1, $2, $3, '', FALSE, NULL, 'pending')
ON CONFLICT (user_id) DO NOTHING;

-- name: ListOrganizerVerificationRequests :many
SELECT op.user_id,
       users.username,
       users.email,
       op.cui,
       op.company_name,
       op.fiscal_address,
       op.verification_status,
       op.is_verified,
       op.created_at,
       op.updated_at,
       op.verified_at
FROM organizer_profiles op
JOIN users ON users.id = op.user_id
ORDER BY CASE op.verification_status
             WHEN 'pending' THEN 0
             WHEN 'rejected' THEN 1
             ELSE 2
         END,
         op.updated_at DESC;

-- name: ReviewOrganizerVerification :one
UPDATE organizer_profiles
SET verification_status = $2,
    is_verified = ($2 = 'approved'),
    verified_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE NULL END,
    updated_at = NOW()
WHERE user_id = $1
RETURNING *;

-- name: AcceptOrganizerAgreement :one
UPDATE organizer_profiles
SET organizer_agreement_version = $2,
    organizer_agreement_accepted_at = $3,
    organizer_agreement_accepted_ip = $4,
    updated_at = NOW()
WHERE user_id = $1
RETURNING *;

-- name: SetOrganizerStripeAccount :one
UPDATE organizer_profiles
SET stripe_account_id = $2,
    stripe_charges_enabled = $3,
    stripe_payouts_enabled = $4,
    stripe_details_submitted = $5,
    updated_at = NOW()
WHERE user_id = $1
RETURNING *;

-- name: UpdateOrganizerStripeAccountStatus :one
UPDATE organizer_profiles
SET stripe_charges_enabled = $2,
    stripe_payouts_enabled = $3,
    stripe_details_submitted = $4,
    updated_at = NOW()
WHERE stripe_account_id = $1
RETURNING *;

-- name: ClearOrganizerStripeAccount :one
UPDATE organizer_profiles
SET stripe_account_id = NULL,
    stripe_charges_enabled = FALSE,
    stripe_payouts_enabled = FALSE,
    stripe_details_submitted = FALSE,
    updated_at = NOW()
WHERE stripe_account_id = $1
RETURNING *;
