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
