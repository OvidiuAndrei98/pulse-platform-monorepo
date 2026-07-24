-- name: SaveEvent :exec
INSERT INTO saved_events (user_id, event_id)
VALUES ($1, $2)
ON CONFLICT (user_id, event_id) DO NOTHING;

-- name: RemoveSavedEvent :exec
DELETE FROM saved_events
WHERE user_id = $1 AND event_id = $2;

-- name: ListSavedEvents :many
SELECT e.*
FROM saved_events se
JOIN events e ON e.id = se.event_id
WHERE se.user_id = $1
ORDER BY se.created_at DESC;
