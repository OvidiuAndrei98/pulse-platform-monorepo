-- name: CreateCheckIn :one
INSERT INTO check_ins (user_id, event_id)
VALUES ($1, $2)
ON CONFLICT (user_id, event_id) DO UPDATE SET created_at = CURRENT_TIMESTAMP
RETURNING id, user_id, event_id, created_at;

-- name: UpsertEventRsvp :exec
INSERT INTO event_rsvps (user_id, event_id, status)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, event_id)
DO UPDATE SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP;

-- name: DeleteEventRsvp :exec
DELETE FROM event_rsvps
WHERE user_id = $1 AND event_id = $2;

-- name: GetEventSocialSummary :one
WITH ticket_holders AS (
    SELECT DISTINCT t.user_id
    FROM tickets t
    JOIN orders o ON o.id = t.order_id
    JOIN ticket_types tt ON tt.id = t.ticket_type_id
    WHERE tt.event_id = $1
      AND o.status = 'completed'
      AND t.user_id IS NOT NULL
),
going_users AS (
    SELECT user_id FROM ticket_holders
    UNION
    SELECT r.user_id
    FROM event_rsvps r
    WHERE r.event_id = $1
      AND r.status = 'going'
      AND NOT EXISTS (SELECT 1 FROM ticket_holders th WHERE th.user_id = r.user_id)
)
SELECT
    (
        SELECT COUNT(*)::bigint
        FROM event_rsvps r
        WHERE r.event_id = $1
          AND r.status = 'interested'
          AND NOT EXISTS (SELECT 1 FROM ticket_holders th WHERE th.user_id = r.user_id)
    ) AS interested_count,
    (SELECT COUNT(*)::bigint FROM going_users) AS going_count,
    (SELECT COUNT(*)::bigint FROM ticket_holders) AS ticket_holder_count,
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM tickets t
            JOIN orders o ON o.id = t.order_id
            JOIN ticket_types tt ON tt.id = t.ticket_type_id
            WHERE tt.event_id = $1 AND o.status = 'completed' AND t.user_id = $2
        ) THEN 'has_ticket'
        WHEN EXISTS (SELECT 1 FROM event_rsvps WHERE event_id = $1 AND user_id = $2 AND status = 'going') THEN 'going'
        WHEN EXISTS (SELECT 1 FROM event_rsvps WHERE event_id = $1 AND user_id = $2 AND status = 'interested') THEN 'interested'
        ELSE 'none'
    END AS current_user_status;

-- name: ListFriendEventActivity :many
WITH friend_ids AS (
    SELECT friend_id AS user_id
    FROM friendships f
    WHERE f.user_id = $1 AND f.status = 'accepted'
    UNION
    SELECT user_id
    FROM friendships f
    WHERE f.friend_id = $1 AND f.status = 'accepted'
),
ticket_holders AS (
    SELECT DISTINCT t.user_id
    FROM tickets t
    JOIN orders o ON o.id = t.order_id
    JOIN ticket_types tt ON tt.id = t.ticket_type_id
    WHERE tt.event_id = $2
      AND o.status = 'completed'
      AND t.user_id IS NOT NULL
)
SELECT u.id, u.username, u.avatar_url,
       CASE
           WHEN th.user_id IS NOT NULL THEN 'has_ticket'
           ELSE r.status
       END AS status
FROM friend_ids f
JOIN users u ON u.id = f.user_id
LEFT JOIN ticket_holders th ON th.user_id = u.id
LEFT JOIN event_rsvps r ON r.user_id = u.id AND r.event_id = $2
WHERE th.user_id IS NOT NULL OR r.status IS NOT NULL
ORDER BY CASE WHEN th.user_id IS NOT NULL THEN 0 WHEN r.status = 'going' THEN 1 ELSE 2 END, u.username ASC
LIMIT 8;

-- name: DeleteCheckIn :exec
DELETE FROM check_ins 
WHERE user_id = $1 AND event_id = $2;

-- name: AddComment :one
INSERT INTO comments (event_id, user_id, content)
VALUES ($1, $2, $3)
RETURNING id, event_id, user_id, content, created_at;

-- name: GetFriends :many
SELECT DISTINCT u.id, u.username, u.email, u.role, u.avatar_url, u.bio, u.created_at
FROM friendships f
JOIN users u ON (f.friend_id = u.id AND f.user_id = $1) OR (f.user_id = u.id AND f.friend_id = $1)
WHERE f.status = 'accepted';

-- name: CreateFriendRequest :exec
INSERT INTO friendships (user_id, friend_id, status)
VALUES ($1, $2, 'pending')
ON CONFLICT (user_id, friend_id)
DO UPDATE SET status = 'pending'
WHERE friendships.status = 'declined';

-- name: GetFriendRequests :many
SELECT u.id, u.username, u.email, u.role, u.avatar_url, u.bio, u.created_at
FROM friendships f
JOIN users u ON (f.user_id = u.id AND f.friend_id = $1)
WHERE f.status = 'pending';

-- name: AcceptFriendRequest :execrows
UPDATE friendships
SET status = 'accepted'
WHERE ((user_id = $2 AND friend_id = $1)
    OR (user_id = $1 AND friend_id = $2))
  AND status = 'pending';

-- name: DeclineFriendRequest :exec
DELETE FROM friendships
WHERE user_id = $2 AND friend_id = $1 AND status = 'pending';

-- name: ConnectFriends :exec
WITH existing AS (
    SELECT 1
    FROM friendships
    WHERE (user_id = $1 AND friend_id = $2)
       OR (user_id = $2 AND friend_id = $1)
), accepted AS (
    UPDATE friendships
    SET status = 'accepted'
    WHERE (user_id = $1 AND friend_id = $2)
       OR (user_id = $2 AND friend_id = $1)
)
INSERT INTO friendships (user_id, friend_id, status)
SELECT $1, $2, 'accepted'
WHERE NOT EXISTS (SELECT 1 FROM existing);

-- Legacy queries retained until the old handlers can be removed in a dedicated cleanup.
-- name: SendFriendRequest :exec
INSERT INTO friendships (user_id, friend_id, status)
VALUES ($1, $2, 'pending')
ON CONFLICT (user_id, friend_id) DO NOTHING;

-- name: RespondToFriendRequest :exec
UPDATE friendships
SET status = $3
WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1);
