-- name: GetLiveEventsInArea :many
SELECT id, organizer_id, title, description, category, status, banner_url, google_place_id, location_name, city, vibe, latitude, longitude, start_time, end_time, is_live, created_at
FROM events 
WHERE is_live = true 
  AND latitude BETWEEN $1 AND $2 
  AND longitude BETWEEN $3 AND $4;

-- name: ListEvents :many
SELECT 
    e.id, e.organizer_id, e.title, e.description, e.category, e.status, 
    e.banner_url, e.google_place_id, e.location_name, e.city, e.vibe, e.latitude, e.longitude, e.start_time,
    e.end_time, e.is_live, e.created_at,
    
    (
        SELECT COUNT(*) 
        FROM check_ins 
        WHERE event_id = e.id
    )::bigint AS total_check_ins,
    
    EXISTS(
        SELECT 1 
        FROM check_ins 
        WHERE check_ins.event_id = e.id 
          AND check_ins.user_id = sqlc.arg(user_id)
    ) AS user_has_checked_in,
    EXISTS(
        SELECT 1
        FROM saved_events
        WHERE saved_events.event_id = e.id
          AND saved_events.user_id = sqlc.arg(user_id)
    ) AS is_favorited,
    
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id', tt.id,
                    'name', tt.name,
                    'price_ron', tt.price_ron,
                    'capacity', tt.capacity,
                    'start_sales', tt.start_sales,
                    'end_sales', tt.end_sales,
                    'description', tt.description
                )
            )
            FROM ticket_types tt
            WHERE tt.event_id = e.id
        ), 
        '[]'::json
    ) AS ticket_types
FROM events e
WHERE (sqlc.arg(category)::VARCHAR = '' OR sqlc.arg(category) IS NULL OR e.category = ANY(string_to_array(sqlc.arg(category)::VARCHAR, ',')))
  AND (sqlc.arg(city)::VARCHAR = '' OR sqlc.arg(city) IS NULL OR e.city = sqlc.arg(city))
  AND (sqlc.arg(vibe)::VARCHAR = '' OR sqlc.arg(vibe) IS NULL OR e.vibe = ANY(string_to_array(sqlc.arg(vibe)::VARCHAR, ',')))
  -- Filtre geolocație cu nume clare
  AND (sqlc.narg(lat_min)::FLOAT IS NULL OR e.latitude BETWEEN sqlc.narg(lat_min) AND sqlc.narg(lat_max))
  AND (sqlc.narg(lon_min)::FLOAT IS NULL OR e.longitude BETWEEN sqlc.narg(lon_min) AND sqlc.narg(lon_max))
  -- Filtru ID specific
  AND (sqlc.narg(event_id)::UUID IS NULL OR e.id = sqlc.narg(event_id))
ORDER BY e.start_time DESC
LIMIT sqlc.arg(req_limit) OFFSET sqlc.arg(req_offset);

-- name: ListEventsWithStats :many
SELECT 
    e.*,
    (
        SELECT COUNT(*)::bigint 
        FROM check_ins 
        WHERE event_id = e.id
    ) AS total_check_ins,
    COALESCE(SUM(tt.tickets_sold), 0)::bigint AS total_tickets_sold,
    COALESCE(SUM(tt.tickets_sold * tt.price_ron), 0)::bigint AS total_revenue_ron,
    (SELECT COUNT(*)::bigint FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'interested') AS interested_count,
    (SELECT COUNT(*)::bigint FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'going' AND NOT EXISTS (
        SELECT 1 FROM tickets t
        JOIN orders o ON o.id = t.order_id
        JOIN ticket_types ticket_type ON ticket_type.id = t.ticket_type_id
        WHERE ticket_type.event_id = e.id AND o.status = 'completed' AND t.user_id = r.user_id
    ))
      + (SELECT COUNT(DISTINCT t.user_id)::bigint FROM tickets t JOIN orders o ON o.id = t.order_id JOIN ticket_types ticket_type ON ticket_type.id = t.ticket_type_id WHERE ticket_type.event_id = e.id AND o.status = 'completed' AND t.user_id IS NOT NULL) AS going_count,
    (SELECT COUNT(DISTINCT t.user_id)::bigint FROM tickets t JOIN orders o ON o.id = t.order_id JOIN ticket_types ticket_type ON ticket_type.id = t.ticket_type_id WHERE ticket_type.event_id = e.id AND o.status = 'completed' AND t.user_id IS NOT NULL) AS ticket_holder_count,
    COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', tt.id,
                'name', tt.name,
                'price_ron', tt.price_ron,
                'capacity', tt.capacity,
                'tickets_sold', tt.tickets_sold,
                'start_sales', tt.start_sales,
                'end_sales', tt.end_sales,
                'description', tt.description
            )
        ) FILTER (WHERE tt.id IS NOT NULL),
        '[]'::jsonb
    ) AS ticket_types
FROM events e
LEFT JOIN ticket_types tt ON tt.event_id = e.id
WHERE e.organizer_id = $1
GROUP BY e.id
ORDER BY e.start_time DESC;

-- name: CreateEvent :one
INSERT INTO events (organizer_id, title, description, category, status, banner_url, google_place_id, location_name, city, vibe, latitude, longitude, start_time, end_time)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING *; 

-- name: EditEvent :one
UPDATE events
SET title = $2,
    description = $3,
    category = $4,
    status = $5,
    banner_url = $6,
    google_place_id = $7,
    location_name = $8,
    city = $9,
    vibe = $10,
    latitude = $11,
    longitude = $12,
    start_time = $13,
    end_time = $14
WHERE id = $1
RETURNING *; -- RETURNING * va aduce status-ul modificat

-- name: GetEventByID :one
SELECT 
    e.id, e.organizer_id, e.title, e.description, e.category, e.status, 
    e.banner_url, e.google_place_id, e.location_name, e.city, e.vibe, e.latitude, e.longitude, e.start_time,
    e.end_time, e.is_live, e.created_at,
    
    -- Numărul total de check-ins (vizibil public)
    (
        SELECT COUNT(*) 
        FROM check_ins 
        WHERE event_id = e.id
    )::bigint AS total_check_ins,
    
    -- Verifică dacă utilizatorul curent ($1) a făcut check-in
    EXISTS(
        SELECT 1 
        FROM check_ins 
        WHERE check_ins.event_id = e.id 
          AND check_ins.user_id = $1
    ) AS user_has_checked_in,
    EXISTS(
        SELECT 1
        FROM saved_events
        WHERE saved_events.event_id = e.id
          AND saved_events.user_id = $1
    ) AS is_favorited,
    
    -- Array JSON cu biletele (FĂRĂ câmpul sensibil tickets_sold)
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id', tt.id,
                    'name', tt.name,
                    'price_ron', tt.price_ron,
                    'capacity', tt.capacity,
                    'start_sales', tt.start_sales,
                    'end_sales', tt.end_sales,
                    'description', tt.description
                )
            )
            FROM ticket_types tt
            WHERE tt.event_id = e.id
        ), 
        '[]'::json
    ) AS ticket_types
FROM events e
WHERE e.id = $2 LIMIT 1;

-- name: GetEventWithStats :one
SELECT 
    e.*,
    
    (
        SELECT COUNT(*) 
        FROM check_ins 
        WHERE event_id = e.id
    )::bigint AS total_check_ins,
    
    COALESCE(
        (
            SELECT SUM(tt.tickets_sold) 
            FROM ticket_types tt 
            WHERE tt.event_id = e.id
        ), 
        0
    )::bigint AS total_tickets_sold,
    
    COALESCE(
        (
            SELECT SUM(tt.tickets_sold * tt.price_ron) 
            FROM ticket_types tt 
            WHERE tt.event_id = e.id
        ), 
        0
    )::bigint AS total_revenue_ron,

    (SELECT COUNT(*)::bigint FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'interested') AS interested_count,
    (SELECT COUNT(*)::bigint FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'going' AND NOT EXISTS (
        SELECT 1 FROM tickets t
        JOIN orders o ON o.id = t.order_id
        JOIN ticket_types ticket_type ON ticket_type.id = t.ticket_type_id
        WHERE ticket_type.event_id = e.id AND o.status = 'completed' AND t.user_id = r.user_id
    ))
      + (SELECT COUNT(DISTINCT t.user_id)::bigint FROM tickets t JOIN orders o ON o.id = t.order_id JOIN ticket_types ticket_type ON ticket_type.id = t.ticket_type_id WHERE ticket_type.event_id = e.id AND o.status = 'completed' AND t.user_id IS NOT NULL) AS going_count,
    (SELECT COUNT(DISTINCT t.user_id)::bigint FROM tickets t JOIN orders o ON o.id = t.order_id JOIN ticket_types ticket_type ON ticket_type.id = t.ticket_type_id WHERE ticket_type.event_id = e.id AND o.status = 'completed' AND t.user_id IS NOT NULL) AS ticket_holder_count,

    -- Include și tickets_sold în interiorul fiecărui tip de bilet
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id', tt.id,
                    'name', tt.name,
                    'price_ron', tt.price_ron,
                    'capacity', tt.capacity,
                    'tickets_sold', tt.tickets_sold,
                    'start_sales', tt.start_sales,
                    'end_sales', tt.end_sales,
                    'description', tt.description
                )
            )
            FROM ticket_types tt
            WHERE tt.event_id = e.id
        ), 
        '[]'::json
    ) AS ticket_types
FROM events e
WHERE e.id = $1 LIMIT 1;

-- name: DeleteEvent :exec
DELETE FROM events WHERE id = $1;

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
