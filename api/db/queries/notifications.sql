-- name: CreateNotification :exec
INSERT INTO notifications (user_id, type, title, body, event_id, actor_id)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: CreateOrganizerEventNotifications :exec
INSERT INTO notifications (user_id, type, title, body, event_id, actor_id)
SELECT
    follows.follower_id,
    'organizer_event',
    'Eveniment nou',
    COALESCE(NULLIF(profile.company_name, ''), organizer.username) || ' a publicat ' || event.title,
    event.id,
    organizer.id
FROM events event
JOIN users organizer ON organizer.id = event.organizer_id
LEFT JOIN organizer_profiles profile ON profile.user_id = organizer.id
JOIN organizer_follows follows ON follows.organizer_id = event.organizer_id
WHERE event.id = $1;

-- name: CreateTicketPurchaseNotification :exec
INSERT INTO notifications (user_id, type, title, body, event_id, actor_id)
SELECT
    order_row.user_id,
    'ticket_purchased',
    'Biletele tale sunt confirmate',
    'Ai primit biletele pentru ' || event.title,
    event.id,
    event.organizer_id
FROM orders order_row
JOIN events event ON event.id = order_row.event_id
WHERE order_row.id = $1 AND order_row.user_id IS NOT NULL;

-- name: ListNotifications :many
SELECT
    notification.id,
    notification.type,
    notification.title,
    notification.body,
    notification.event_id,
    notification.actor_id,
    notification.read_at,
    notification.created_at,
    COALESCE(actor.username, '') AS actor_username,
    actor.avatar_url AS actor_avatar_url
FROM notifications notification
LEFT JOIN users actor ON actor.id = notification.actor_id
WHERE notification.user_id = $1
ORDER BY notification.created_at DESC
LIMIT $2;

-- name: CountUnreadNotifications :one
SELECT COUNT(*)::bigint
FROM notifications
WHERE user_id = $1 AND read_at IS NULL;

-- name: MarkAllNotificationsRead :exec
UPDATE notifications
SET read_at = CURRENT_TIMESTAMP
WHERE user_id = $1 AND read_at IS NULL;
