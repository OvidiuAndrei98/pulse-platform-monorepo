-- name: CreateUser :one
INSERT INTO users (username, email, password_hash, avatar_url, role, bio, is_active, google_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1 LIMIT 1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1 LIMIT 1;

-- name: GetUserByGoogleID :one
SELECT * FROM users WHERE google_id = $1 LIMIT 1;

-- name: UpdateUserActivation :exec
UPDATE users SET is_active = $1 WHERE id = $2;

-- name: UpdateUserPassword :exec
UPDATE users SET password_hash = $1 WHERE id = $2;

-- name: UpdateUserProfile :one
UPDATE users
SET
    username   = COALESCE(NULLIF($2, ''), username),
    email      = COALESCE(NULLIF($3, ''), email),
    role       = COALESCE(NULLIF($4, ''), role),
    avatar_url = COALESCE(NULLIF($5, ''), avatar_url),
    bio        = COALESCE($6, bio)
WHERE id = $1
RETURNING id, username, email, role, avatar_url, bio, created_at;

-- name: UpdateUserActivated :exec
UPDATE users
SET is_active = true
WHERE id = $1;