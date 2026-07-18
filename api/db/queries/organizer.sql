-- name: CreateOrganizerProfile :one
INSERT INTO organizer_profiles (
    user_id, cui, company_name, fiscal_address, is_verified, verified_at, verification_status
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (user_id) DO UPDATE 
SET 
    cui = EXCLUDED.cui, 
    company_name = EXCLUDED.company_name, 
    fiscal_address = EXCLUDED.fiscal_address, 
    is_verified = EXCLUDED.is_verified, 
    verified_at = EXCLUDED.verified_at,
    verification_status = EXCLUDED.verification_status
RETURNING *;

-- name: GetOrganizerProfile :one
SELECT * FROM organizer_profiles WHERE user_id = $1 LIMIT 1;

-- name: GetOrganizerByCUI :one
SELECT * FROM organizer_profiles WHERE cui = $1 LIMIT 1;