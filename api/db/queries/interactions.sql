-- name: CreateCheckIn :one
INSERT INTO check_ins (user_id, event_id)
VALUES ($1, $2)
ON CONFLICT (user_id, event_id) DO UPDATE SET created_at = CURRENT_TIMESTAMP
RETURNING id, user_id, event_id, created_at;

-- name: DeleteCheckIn :exec
DELETE FROM check_ins 
WHERE user_id = $1 AND event_id = $2;

-- name: AddComment :one
INSERT INTO comments (event_id, user_id, content)
VALUES ($1, $2, $3)
RETURNING id, event_id, user_id, content, created_at;

-- name: GetFriends :many
SELECT u.id, u.username, u.email, u.role, u.avatar_url, u.bio, u.created_at
FROM friendships f
JOIN users u ON (f.friend_id = u.id AND f.user_id = $1) OR (f.user_id = u.id AND f.friend_id = $1)
WHERE f.status = 'accepted';

-- name: SendFriendRequest :exec
INSERT INTO friendships (user_id, friend_id, status)
VALUES ($1, $2, 'pending')
ON CONFLICT (user_id, friend_id) DO NOTHING;

-- name: RespondToFriendRequest :exec
UPDATE friendships
SET status = $3
WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1);