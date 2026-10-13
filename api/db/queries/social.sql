-- name: SearchProfiles :many
SELECT u.id, u.username, u.avatar_url, u.bio, u.role,
       COALESCE(op.company_name, '') AS organizer_name,
       COALESCE(op.is_verified, false) AS organizer_verified
FROM users u
LEFT JOIN organizer_profiles op ON op.user_id = u.id
WHERE (u.username ILIKE '%' || $1 || '%'
   OR COALESCE(op.company_name, '') ILIKE '%' || $1 || '%')
  AND (sqlc.arg(kind)::text = ''
       OR (sqlc.arg(kind)::text = 'organizers' AND u.role = 'organizer')
       OR (sqlc.arg(kind)::text = 'people' AND u.role <> 'organizer'))
ORDER BY CASE WHEN LOWER(u.username) = LOWER($1) THEN 0 ELSE 1 END, u.username ASC
LIMIT 20;

-- name: GetPublicProfile :one
SELECT u.id, u.username, u.avatar_url, u.bio, u.role,
       COALESCE(op.company_name, '') AS organizer_name,
       COALESCE(op.is_verified, false) AS organizer_verified
FROM users u
LEFT JOIN organizer_profiles op ON op.user_id = u.id
WHERE u.id = $1;

-- name: GetFriendshipRelationship :one
SELECT COALESCE((
    SELECT CASE
        WHEN f.status = 'accepted' THEN 'friends'
        WHEN f.user_id = $1 THEN 'pending_sent'
        ELSE 'pending_received'
    END
    FROM friendships f
    WHERE (f.user_id = $1 AND f.friend_id = $2)
       OR (f.user_id = $2 AND f.friend_id = $1)
    ORDER BY CASE WHEN f.status = 'accepted' THEN 0 ELSE 1 END
    LIMIT 1
), 'none')::text AS relationship;

-- name: GetOrganizerFollowState :one
SELECT EXISTS(
    SELECT 1 FROM organizer_follows
    WHERE follower_id = $1 AND organizer_id = $2
) AS follows;

-- name: GetOrganizerFollowerCount :one
SELECT COUNT(*)::bigint AS follower_count
FROM organizer_follows
WHERE organizer_id = $1;

-- name: GetOrganizerPublicStats :one
SELECT
    COUNT(DISTINCT e.id)::bigint AS event_count,
    COUNT(t.id) FILTER (WHERE o.status = 'completed')::bigint AS tickets_sold_count
FROM events e
LEFT JOIN ticket_types tt ON tt.event_id = e.id
LEFT JOIN tickets t ON t.ticket_type_id = tt.id
LEFT JOIN orders o ON o.id = t.order_id
WHERE e.organizer_id = $1
  AND e.status = 'published';

-- name: FollowOrganizer :exec
INSERT INTO organizer_follows (follower_id, organizer_id)
VALUES ($1, $2)
ON CONFLICT (follower_id, organizer_id) DO NOTHING;

-- name: UnfollowOrganizer :exec
DELETE FROM organizer_follows
WHERE follower_id = $1 AND organizer_id = $2;

-- name: ListEventAttendees :many
WITH ticket_holders AS (
    SELECT DISTINCT t.user_id
    FROM tickets t
    JOIN orders o ON o.id = t.order_id
    JOIN ticket_types tt ON tt.id = t.ticket_type_id
    WHERE tt.event_id = $1 AND o.status = 'completed' AND t.user_id IS NOT NULL
), going_users AS (
    SELECT user_id FROM ticket_holders
    UNION
    SELECT r.user_id
    FROM event_rsvps r
    WHERE r.event_id = $1 AND r.status = 'going'
)
SELECT u.id, u.username, u.avatar_url,
       CASE WHEN th.user_id IS NOT NULL THEN 'has_ticket' ELSE 'going' END::text AS attendance_status
FROM going_users gu
JOIN users u ON u.id = gu.user_id
LEFT JOIN ticket_holders th ON th.user_id = gu.user_id
WHERE u.show_attendance_publicly = TRUE
ORDER BY CASE WHEN th.user_id IS NOT NULL THEN 0 ELSE 1 END, u.username ASC
LIMIT 30;

-- name: ListSocialFeed :many
WITH friend_ids AS (
    SELECT f.friend_id AS user_id FROM friendships f WHERE f.user_id = $1 AND f.status = 'accepted'
    UNION
    SELECT f.user_id FROM friendships f WHERE f.friend_id = $1 AND f.status = 'accepted'
), activities AS (
    SELECT 'friend_ticket'::text AS activity_type,
           MAX(o.created_at) AS occurred_at,
           u.id AS actor_id, u.username AS actor_username, u.avatar_url AS actor_avatar_url,
           e.id AS event_id, e.title AS event_title, e.banner_url AS event_banner_url,
           e.start_time AS event_start_time, ''::text AS organizer_name,
           NULL::uuid AS organizer_update_id, ''::text AS organizer_update_image_url,
           ''::text AS organizer_update_caption
    FROM tickets t
    JOIN orders o ON o.id = t.order_id AND o.status = 'completed'
    JOIN ticket_types tt ON tt.id = t.ticket_type_id
    JOIN events e ON e.id = tt.event_id
    JOIN users u ON u.id = t.user_id AND u.show_attendance_publicly = TRUE
    WHERE t.user_id IN (SELECT user_id FROM friend_ids)
    GROUP BY u.id, u.username, u.avatar_url, e.id, e.title, e.banner_url, e.start_time

    UNION ALL

    SELECT 'friend_going'::text AS activity_type,
           r.updated_at AS occurred_at,
           u.id AS actor_id, u.username AS actor_username, u.avatar_url AS actor_avatar_url,
           e.id AS event_id, e.title AS event_title, e.banner_url AS event_banner_url,
           e.start_time AS event_start_time, ''::text AS organizer_name,
           NULL::uuid AS organizer_update_id, ''::text AS organizer_update_image_url,
           ''::text AS organizer_update_caption
    FROM event_rsvps r
    JOIN users u ON u.id = r.user_id AND u.show_attendance_publicly = TRUE
    JOIN events e ON e.id = r.event_id
    WHERE r.user_id IN (SELECT user_id FROM friend_ids)
      AND r.status = 'going'
      AND NOT EXISTS (
          SELECT 1
          FROM tickets t
          JOIN orders o ON o.id = t.order_id AND o.status = 'completed'
          JOIN ticket_types tt ON tt.id = t.ticket_type_id
          WHERE t.user_id = r.user_id AND tt.event_id = r.event_id
      )

    UNION ALL

    SELECT 'organizer_event'::text AS activity_type,
           e.created_at AS occurred_at,
           u.id AS actor_id, u.username AS actor_username, u.avatar_url AS actor_avatar_url,
           e.id AS event_id, e.title AS event_title, e.banner_url AS event_banner_url,
           e.start_time AS event_start_time, op.company_name AS organizer_name,
           NULL::uuid AS organizer_update_id, ''::text AS organizer_update_image_url,
           ''::text AS organizer_update_caption
    FROM organizer_follows follows
    JOIN events e ON e.organizer_id = follows.organizer_id AND e.status = 'published'
    JOIN users u ON u.id = follows.organizer_id
    LEFT JOIN organizer_profiles op ON op.user_id = u.id
    WHERE follows.follower_id = $1

    UNION ALL

    SELECT 'organizer_update'::text AS activity_type,
           eu.created_at AS occurred_at,
           u.id AS actor_id, u.username AS actor_username, u.avatar_url AS actor_avatar_url,
           e.id AS event_id, e.title AS event_title, e.banner_url AS event_banner_url,
           e.start_time AS event_start_time, op.company_name AS organizer_name,
           eu.id AS organizer_update_id, eu.image_url AS organizer_update_image_url,
           COALESCE(eu.caption, '')::text AS organizer_update_caption
    FROM organizer_follows follows
    JOIN event_updates eu ON eu.organizer_id = follows.organizer_id
        AND eu.expires_at > CURRENT_TIMESTAMP
    JOIN events e ON e.id = eu.event_id AND e.status = 'published'
    JOIN users u ON u.id = follows.organizer_id
    LEFT JOIN organizer_profiles op ON op.user_id = u.id
    WHERE follows.follower_id = $1
)
SELECT * FROM activities
ORDER BY occurred_at DESC
LIMIT 40;
