-- name: GetUserByID :one
SELECT id, username, email, password_hash, avatar_url, role, bio, created_at 
FROM users 
WHERE id = $1 LIMIT 1;

-- name: GetUserByEmail :one
SELECT id, username, email, password_hash, avatar_url, role, bio, created_at 
FROM users 
WHERE email = $1 LIMIT 1;

-- name: CreateUser :one
INSERT INTO users (username, email, password_hash, role)
VALUES ($1, $2, $3, COALESCE($4, 'user'))
RETURNING id, username, email, role, avatar_url, bio, created_at;

-- name: UpdateUserProfile :one
UPDATE users
SET 
    avatar_url = COALESCE($2, avatar_url),
    bio = COALESCE($3, bio)
WHERE id = $1
RETURNING id, username, email, role, avatar_url, bio, created_at;