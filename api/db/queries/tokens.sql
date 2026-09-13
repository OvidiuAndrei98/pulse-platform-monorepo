-- name: InsertUserToken :one
INSERT INTO user_tokens (user_id, token_hash, type, expires_at)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetUserTokenByHash :one
SELECT id, user_id, token_hash, type, expires_at, created_at
FROM user_tokens
WHERE token_hash = $1
  AND type = $2
  AND expires_at > clock_timestamp();

-- name: DeleteUserToken :exec
DELETE FROM user_tokens
WHERE token_hash = $1
  AND type = $2;

-- name: LockUserForPasswordReset :one
SELECT id FROM users WHERE id = $1 FOR UPDATE;

-- name: DeleteUserPasswordResetTokens :exec
DELETE FROM user_tokens WHERE user_id = $1 AND type = 'password_reset';
