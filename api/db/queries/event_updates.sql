-- name: GetEventForOrganizerUpdate :one
SELECT id, organizer_id, title, status, end_time
FROM events
WHERE id = $1;

-- name: LockOrganizerEventUpdates :exec
SELECT pg_advisory_xact_lock(hashtext($1::text));

-- name: CountActiveOrganizerUpdates :one
SELECT COUNT(*)::bigint
FROM event_updates
WHERE organizer_id = $1
  AND expires_at > CURRENT_TIMESTAMP;

-- name: CreateEventUpdate :one
INSERT INTO event_updates (event_id, organizer_id, image_url, caption)
VALUES ($1, $2, $3, $4)
RETURNING id, event_id, organizer_id, image_url, caption, created_at, expires_at;

-- name: ListActiveEventUpdates :many
SELECT eu.id, eu.event_id, eu.organizer_id, eu.image_url, eu.caption,
       eu.created_at, eu.expires_at, e.title AS event_title
FROM event_updates eu
JOIN events e ON e.id = eu.event_id
WHERE eu.event_id = $1
  AND eu.expires_at > CURRENT_TIMESTAMP
ORDER BY eu.created_at DESC;

-- name: ListActiveOrganizerUpdates :many
SELECT eu.id, eu.event_id, eu.organizer_id, eu.image_url, eu.caption,
       eu.created_at, eu.expires_at, e.title AS event_title
FROM event_updates eu
JOIN events e ON e.id = eu.event_id
WHERE eu.organizer_id = $1
  AND eu.expires_at > CURRENT_TIMESTAMP
ORDER BY eu.created_at DESC;

-- name: DeleteOrganizerEventUpdate :one
DELETE FROM event_updates
WHERE id = $1
  AND organizer_id = $2
RETURNING image_url;
