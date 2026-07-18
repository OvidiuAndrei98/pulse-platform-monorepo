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
INSERT INTO events (organizer_id, title, description, category, banner_url, google_place_id, location_name, latitude, longitude, start_time, end_time)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;

-- name: EditEvent :one
UPDATE events
SET title = $2,
    description = $3,
    category = $4,
    banner_url = $5,
    google_place_id = $6,
    location_name = $7,
    latitude = $8,
    longitude = $9,
    start_time = $10,
    end_time = $11
WHERE id = $1
RETURNING *;

-- name: GetEventByID :one
SELECT id, organizer_id, title, description, category, banner_url, location_name, latitude, longitude, start_time, end_time, is_live, created_at
FROM events 
WHERE id = $1 LIMIT 1;

-- name: DeleteEvent :exec
DELETE FROM events WHERE id = $1;

-- name: GetEventWithStats :one
SELECT 
    e.*,
    (SELECT COUNT(*) FROM check_ins WHERE event_id = e.id) AS check_ins_count,
    EXISTS(
        SELECT 1 
        FROM check_ins 
        WHERE check_ins.event_id = e.id 
          AND check_ins.user_id = $1
    ) AS user_has_checked_in
FROM events e
WHERE e.id = $2;

-- name: GetCommentsForEvent :many
SELECT c.id, c.content, c.created_at, u.username, u.avatar_url
FROM comments c
JOIN users u ON c.user_id = u.id
WHERE c.event_id = $1
ORDER BY c.created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetFriendsGoingToEvent :many
SELECT u.id, u.username, u.avatar_url
FROM check_ins c
JOIN users u ON c.user_id = u.id
WHERE c.event_id = $1 
  AND c.user_id IN (
      SELECT f.friend_id FROM friendships f WHERE f.user_id = $2 AND f.status = 'accepted'
      UNION
      SELECT f.user_id FROM friendships f WHERE f.friend_id = $2 AND f.status = 'accepted'
  );