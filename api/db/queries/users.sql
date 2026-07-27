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

-- name: LinkGoogleIdentity :one
UPDATE users
SET google_id = $2,
    avatar_url = COALESCE(NULLIF(avatar_url, ''), NULLIF(sqlc.arg(avatar_url)::TEXT, '')),
    is_active = TRUE
WHERE id = $1
RETURNING *;

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
    bio        = COALESCE($6, bio),
    preferred_language = COALESCE(NULLIF(sqlc.arg(preferred_language)::TEXT, ''), preferred_language),
    show_attendance_publicly = COALESCE(sqlc.narg(show_attendance_publicly)::BOOLEAN, show_attendance_publicly)
WHERE id = $1
RETURNING id, username, email, role, avatar_url, bio, preferred_language, show_attendance_publicly, created_at;

-- name: UpdateUserAvatar :one
UPDATE users
SET avatar_url = $2
WHERE id = $1
RETURNING *;

-- name: UpdateUserActivated :exec
UPDATE users
SET is_active = true
WHERE id = $1;
