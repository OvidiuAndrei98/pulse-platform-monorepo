-- name: GetLiveEventsInArea :many
SELECT id, organizer_id, title, description, category, banner_url, location_name, latitude, longitude, start_time, end_time, is_live, created_at
FROM events 
WHERE is_live = true 
  AND latitude BETWEEN $1 AND $2 
  AND longitude BETWEEN $3 AND $4;

-- name: ListEvents :many
SELECT id, organizer_id, title, description, category, banner_url, location_name, latitude, longitude, start_time, end_time, is_live, created_at
FROM events
WHERE ($1::VARCHAR = '' OR category = $1)
ORDER BY start_time DESC
LIMIT $2 OFFSET $3;

-- name: CreateEvent :one
INSERT INTO events (organizer_id, title, description, category, banner_url, location_name, latitude, longitude, start_time, end_time)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: GetEventByID :one
SELECT id, organizer_id, title, description, category, banner_url, location_name, latitude, longitude, start_time, end_time, is_live, created_at
FROM events 
WHERE id = $1 LIMIT 1;

-- name: DeleteEvent :exec
DELETE FROM events WHERE id = $1;