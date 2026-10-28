-- name: GetEventForValidation :one
SELECT id, organizer_id, title, start_time, end_time, external_ticket_url
FROM events WHERE id = $1;

-- name: GetEventForCheckout :one
SELECT * FROM events WHERE id = $1;

-- name: GetLiveEventsInArea :many
SELECT id, organizer_id, title, description, category, status, banner_url, google_place_id, location_name, city, vibe, latitude, longitude, start_time, end_time, is_live, created_at
FROM events 
WHERE is_live = true 
  AND latitude BETWEEN $1 AND $2 
  AND longitude BETWEEN $3 AND $4;

-- name: ListEvents :many
SELECT
    COALESCE((SELECT rate_bps FROM effective_organizer_commissions c WHERE c.organizer_id = e.organizer_id), (SELECT rate_bps FROM platform_commission_settings))::integer AS commission_rate_bps,
    COALESCE((SELECT per_ticket_bani FROM effective_organizer_commissions c WHERE c.organizer_id = e.organizer_id), (SELECT per_ticket_bani FROM platform_commission_settings))::integer AS commission_per_ticket_bani,
    e.id, e.organizer_id, e.title, e.description, e.category, e.status,
    e.banner_url, e.google_place_id, e.location_name, e.city, e.vibe, e.organizer_absorbs_service_fee, e.vat_percentage, e.external_ticket_url, e.latitude, e.longitude, e.start_time,
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
    ) AS ticket_types,
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id', artist.id,
                    'name', artist.name,
                    'image_url', COALESCE(artist.image_url, ''),
                    'stage', artist.stage,
                    'performance_time', artist.performance_time,
                    'spotify_url', artist.spotify_url,
                    'is_headliner', artist.is_headliner,
                    'source', artist.source
                ) ORDER BY artist.sort_order, artist.created_at
            )
            FROM event_artists artist
            WHERE artist.event_id = e.id
        ),
        '[]'::json
    ) AS lineup
FROM events e
WHERE (sqlc.arg(category)::VARCHAR = '' OR sqlc.arg(category) IS NULL OR e.category = ANY(string_to_array(sqlc.arg(category)::VARCHAR, ',')))
  AND (sqlc.arg(city)::VARCHAR = '' OR sqlc.arg(city) IS NULL OR e.city = sqlc.arg(city))
  AND (sqlc.arg(vibe)::VARCHAR = '' OR sqlc.arg(vibe) IS NULL OR e.vibe = ANY(string_to_array(sqlc.arg(vibe)::VARCHAR, ',')))
  AND (sqlc.narg(starts_after)::TIMESTAMPTZ IS NULL OR e.end_time > sqlc.narg(starts_after))
  AND (sqlc.narg(starts_before)::TIMESTAMPTZ IS NULL OR e.start_time < sqlc.narg(starts_before))
  -- Filtre geolocație cu nume clare
  AND (sqlc.narg(lat_min)::FLOAT IS NULL OR e.latitude BETWEEN sqlc.narg(lat_min) AND sqlc.narg(lat_max))
  AND (sqlc.narg(lon_min)::FLOAT IS NULL OR e.longitude BETWEEN sqlc.narg(lon_min) AND sqlc.narg(lon_max))
  -- Filtru ID specific
  AND (sqlc.narg(event_id)::UUID IS NULL OR e.id = sqlc.narg(event_id))
  -- Filtru organizator pentru profilul public
  AND (sqlc.narg(organizer_id)::UUID IS NULL OR e.organizer_id = sqlc.narg(organizer_id))
  AND NOT EXISTS (
      SELECT 1 FROM user_hidden_event_categories hidden
      WHERE hidden.user_id = sqlc.arg(user_id) AND hidden.category = UPPER(e.category)
  )
  AND (
      e.status = 'published'
      OR (
          sqlc.narg(organizer_id)::UUID IS NOT NULL
          AND e.status = 'completed'
          AND e.was_published = TRUE
      )
  )
  AND (sqlc.arg(search_pattern)::TEXT = '' OR
      lower(e.title || ' ' || e.location_name || ' ' || e.city || ' ' || e.category || ' ' || e.id::text) LIKE sqlc.arg(search_pattern))
ORDER BY e.start_time DESC, e.id ASC
LIMIT sqlc.arg(req_limit) OFFSET sqlc.arg(req_offset);

-- name: ListEventsWithStats :many
SELECT
    COALESCE((SELECT rate_bps FROM effective_organizer_commissions c WHERE c.organizer_id = e.organizer_id), (SELECT rate_bps FROM platform_commission_settings))::integer AS commission_rate_bps,
    COALESCE((SELECT per_ticket_bani FROM effective_organizer_commissions c WHERE c.organizer_id = e.organizer_id), (SELECT per_ticket_bani FROM platform_commission_settings))::integer AS commission_per_ticket_bani,
    e.*,
    (
        SELECT COUNT(*)::bigint 
        FROM check_ins 
        WHERE event_id = e.id
    ) AS total_check_ins,
    -- Inventory also includes unpaid reservations; dashboard sales use issued tickets.
    (SELECT COUNT(*)::bigint FROM tickets t
     JOIN orders o ON o.id = t.order_id
     JOIN ticket_types tier ON tier.id = t.ticket_type_id
     WHERE tier.event_id = e.id AND o.event_id = e.id AND o.status = 'completed'
    ) AS total_tickets_sold,
    (SELECT COUNT(*)::bigint FROM tickets t
     JOIN orders o ON o.id = t.order_id
     JOIN ticket_types tier ON tier.id = t.ticket_type_id
     WHERE tier.event_id = e.id AND o.event_id = e.id AND o.status = 'completed'
       AND t.is_validated = TRUE
    ) AS total_tickets_scanned,
    COALESCE((
        SELECT SUM(oi.quantity::bigint * oi.unit_price_ron::bigint)
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.event_id = e.id AND o.status = 'completed'
    ), 0)::bigint AS total_revenue_ron,
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
    ) AS ticket_types,
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id', artist.id,
                    'name', artist.name,
                    'image_url', COALESCE(artist.image_url, ''),
                    'stage', artist.stage,
                    'performance_time', artist.performance_time,
                    'spotify_url', artist.spotify_url,
                    'is_headliner', artist.is_headliner,
                    'source', artist.source
                ) ORDER BY artist.sort_order, artist.created_at
            )
            FROM event_artists artist
            WHERE artist.event_id = e.id
        ),
        '[]'::json
    ) AS lineup
FROM events e
LEFT JOIN ticket_types tt ON tt.event_id = e.id
WHERE e.organizer_id = $1
GROUP BY e.id
ORDER BY e.start_time DESC;

-- name: CreateEvent :one
INSERT INTO events (organizer_id, title, description, category, status, banner_url, google_place_id, location_name, city, vibe, organizer_absorbs_service_fee, latitude, longitude, start_time, end_time, publish_at, was_published, vat_percentage, external_ticket_url)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, sqlc.arg(mark_published)::BOOLEAN, sqlc.narg(vat_percentage)::NUMERIC, sqlc.narg(external_ticket_url)::TEXT)
RETURNING *; 

-- name: EditEvent :one
UPDATE events
SET title = $2,
    vat_percentage = sqlc.narg(vat_percentage)::NUMERIC,
    external_ticket_url = sqlc.narg(external_ticket_url)::TEXT,
    description = $3,
    category = $4,
    status = $5,
    banner_url = $6,
    google_place_id = $7,
    location_name = $8,
    city = $9,
    vibe = $10,
    organizer_absorbs_service_fee = $11,
    latitude = $12,
    longitude = $13,
    start_time = $14,
    end_time = $15,
    publish_at = $16,
    was_published = events.was_published OR sqlc.arg(mark_published)::BOOLEAN
WHERE id = $1
RETURNING *; -- RETURNING * va aduce status-ul modificat

-- name: LockOwnedEventForBannerChange :one
SELECT id
FROM events
WHERE id = $1 AND organizer_id = $2
FOR UPDATE;

-- name: PublishDueEvents :many
UPDATE events
SET status = 'published', publish_at = NULL, was_published = TRUE
WHERE status = 'scheduled' AND publish_at <= CURRENT_TIMESTAMP
RETURNING id;

-- name: CompleteEndedEvents :exec
UPDATE events
SET status = 'completed', is_live = FALSE
WHERE status IN ('draft', 'scheduled', 'published') AND end_time <= CURRENT_TIMESTAMP;

-- name: GetEventByID :one
SELECT
    COALESCE((SELECT rate_bps FROM effective_organizer_commissions c WHERE c.organizer_id = e.organizer_id), (SELECT rate_bps FROM platform_commission_settings))::integer AS commission_rate_bps,
    COALESCE((SELECT per_ticket_bani FROM effective_organizer_commissions c WHERE c.organizer_id = e.organizer_id), (SELECT per_ticket_bani FROM platform_commission_settings))::integer AS commission_per_ticket_bani,
    e.id, e.organizer_id, e.title, e.description, e.category, e.status,
    e.banner_url, e.google_place_id, e.location_name, e.city, e.vibe, e.organizer_absorbs_service_fee, e.vat_percentage, e.external_ticket_url, e.latitude, e.longitude, e.start_time,
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
    
    -- Include capacitatea deja rezervată/vândută, astfel încât clientul public
    -- să poată dezactiva tipurile sold-out înainte să înceapă checkout-ul.
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
    ) AS ticket_types,
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id', artist.id,
                    'name', artist.name,
                    'image_url', COALESCE(artist.image_url, ''),
                    'stage', artist.stage,
                    'performance_time', artist.performance_time,
                    'spotify_url', artist.spotify_url,
                    'is_headliner', artist.is_headliner,
                    'source', artist.source
                ) ORDER BY artist.sort_order, artist.created_at
            )
            FROM event_artists artist
            WHERE artist.event_id = e.id
        ),
        '[]'::json
    ) AS lineup
FROM events e
WHERE e.id = $2 LIMIT 1;

-- name: GetEventWithStats :one
SELECT
    COALESCE((SELECT rate_bps FROM effective_organizer_commissions c WHERE c.organizer_id = e.organizer_id), (SELECT rate_bps FROM platform_commission_settings))::integer AS commission_rate_bps,
    COALESCE((SELECT per_ticket_bani FROM effective_organizer_commissions c WHERE c.organizer_id = e.organizer_id), (SELECT per_ticket_bani FROM platform_commission_settings))::integer AS commission_per_ticket_bani,
    e.*,
    
    (
        SELECT COUNT(*) 
        FROM check_ins 
        WHERE event_id = e.id
    )::bigint AS total_check_ins,
    
    (SELECT COUNT(*)::bigint FROM tickets t
     JOIN orders o ON o.id = t.order_id
     JOIN ticket_types tier ON tier.id = t.ticket_type_id
     WHERE tier.event_id = e.id AND o.event_id = e.id AND o.status = 'completed'
    ) AS total_tickets_sold,
    (SELECT COUNT(*)::bigint FROM tickets t
     JOIN orders o ON o.id = t.order_id
     JOIN ticket_types tier ON tier.id = t.ticket_type_id
     WHERE tier.event_id = e.id AND o.event_id = e.id AND o.status = 'completed'
       AND t.is_validated = TRUE
    ) AS total_tickets_scanned,
    
    COALESCE(
        (
            SELECT SUM(oi.quantity::bigint * oi.unit_price_ron::bigint)
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.event_id = e.id AND o.status = 'completed'
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
    ) AS ticket_types,
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id', artist.id,
                    'name', artist.name,
                    'image_url', COALESCE(artist.image_url, ''),
                    'stage', artist.stage,
                    'performance_time', artist.performance_time,
                    'spotify_url', artist.spotify_url,
                    'is_headliner', artist.is_headliner,
                    'source', artist.source
                ) ORDER BY artist.sort_order, artist.created_at
            )
            FROM event_artists artist
            WHERE artist.event_id = e.id
        ),
        '[]'::json
    ) AS lineup
FROM events e
WHERE e.id = $1 LIMIT 1;

-- name: DeleteEventArtists :exec
DELETE FROM event_artists WHERE event_id = $1;

-- name: CreateEventArtist :exec
INSERT INTO event_artists (
    event_id, name, image_url, stage, performance_time, spotify_url,
    source, is_headliner, sort_order
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: DeleteEvent :exec
DELETE FROM events WHERE id = $1;

-- name: CountCompletedOrdersForEvent :one
SELECT COUNT(*)::bigint
FROM orders
WHERE event_id = $1 AND status = 'completed';

-- name: CountEventOrders :one
SELECT COUNT(*)::bigint
FROM orders
WHERE event_id = $1;

-- name: SetEventStatus :exec
UPDATE events
SET status = $2
WHERE id = $1;

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
  AND u.show_attendance_publicly = TRUE
  AND c.user_id IN (
      SELECT f.friend_id FROM friendships f WHERE f.user_id = $2 AND f.status = 'accepted'
      UNION
      SELECT f.user_id FROM friendships f WHERE f.friend_id = $2 AND f.status = 'accepted'
  );
