-- name: GetTicketTypesForEvent :many
SELECT * FROM ticket_types 
WHERE event_id = $1 
ORDER BY created_at ASC;

-- name: GetTicketTypeForUpdate :one
SELECT * FROM ticket_types 
WHERE id = $1 
FOR UPDATE;

-- name: CreateTicketType :exec
INSERT INTO ticket_types (event_id, name, description, price_ron, capacity, start_sales, end_sales)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: IncrementTicketsSold :exec
UPDATE ticket_types
SET tickets_sold = tickets_sold + $2
WHERE id = $1;

-- name: DecrementTicketsSold :exec
UPDATE ticket_types
SET tickets_sold = GREATEST(0, tickets_sold - $2)
WHERE id = $1;

-- name: CreateOrder :one
INSERT INTO orders (user_id, event_id, email, total_amount, stripe_payment_intent_id, status)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: CreateCheckoutOrder :one
INSERT INTO orders (user_id, event_id, email, total_amount, platform_fee_bani, status)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateOrderCheckoutSession :exec
UPDATE orders
SET stripe_checkout_session_id = $2
WHERE id = $1;

-- name: GetOrderForUpdate :one
SELECT * FROM orders
WHERE id = $1
FOR UPDATE;

-- name: UpdateOrderStatus :exec
UPDATE orders
SET status = $2, stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id)
WHERE id = $1;

-- name: CreateOrderItem :exec
INSERT INTO order_items (order_id, ticket_type_id, quantity, unit_price_ron)
VALUES ($1, $2, $3, $4);

-- name: GetOrderItems :many
SELECT * FROM order_items
WHERE order_id = $1
ORDER BY created_at ASC;

-- name: ListValidationEvents :many
SELECT e.id, e.title, e.start_time, e.end_time, e.status, e.location_name,
       (e.organizer_id = $1) AS can_manage
FROM events e
LEFT JOIN event_validation_staff staff
       ON staff.event_id = e.id AND staff.user_id = $1
WHERE e.organizer_id = $1 OR staff.user_id IS NOT NULL
ORDER BY e.start_time DESC;

-- name: IsValidationStaffForEvent :one
SELECT EXISTS(
    SELECT 1
    FROM event_validation_staff
    WHERE event_id = $1 AND user_id = $2
) AS is_validation_staff;

-- name: ListValidationStaff :many
SELECT u.id, u.username, u.email, staff.created_at
FROM event_validation_staff staff
JOIN users u ON u.id = staff.user_id
WHERE staff.event_id = $1
ORDER BY u.username ASC;

-- name: AddValidationStaff :exec
INSERT INTO event_validation_staff (event_id, user_id, added_by)
VALUES ($1, $2, $3)
ON CONFLICT (event_id, user_id) DO NOTHING;

-- name: RemoveValidationStaff :exec
DELETE FROM event_validation_staff
WHERE event_id = $1 AND user_id = $2;

-- name: CreateScannerAccess :one
INSERT INTO event_scanner_access (event_id, created_by, label, token_hash, starts_at, ends_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, event_id, label, starts_at, ends_at, revoked_at, created_at;

-- name: ListScannerAccess :many
SELECT id, event_id, label, starts_at, ends_at, revoked_at, created_at
FROM event_scanner_access
WHERE event_id = $1
ORDER BY created_at DESC;

-- name: GetScannerAccessByTokenHash :one
SELECT a.id, a.event_id, a.label, a.starts_at, a.ends_at, a.revoked_at, e.title AS event_title, e.location_name
FROM event_scanner_access a
JOIN events e ON e.id = a.event_id
WHERE a.token_hash = $1;

-- name: GetScannerAccessByID :one
SELECT id, event_id, label, starts_at, ends_at, revoked_at
FROM event_scanner_access
WHERE id = $1;

-- name: RevokeScannerAccess :exec
UPDATE event_scanner_access
SET revoked_at = CURRENT_TIMESTAMP
WHERE id = $1 AND event_id = $2 AND revoked_at IS NULL;

-- name: CreateTicket :one
INSERT INTO tickets (order_id, ticket_type_id, user_id, validation_hash)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdateTicketType :exec
UPDATE ticket_types
SET 
    name = $2,
    price_ron = $3,
    capacity = $4,
    start_sales = $5,
    end_sales = $6,
    description = $7
WHERE id = $1;

-- name: GetTicketByHash :one
SELECT t.*, tt.name as ticket_type_name, e.title as event_title, e.id as event_id
FROM tickets t
JOIN ticket_types tt ON t.ticket_type_id = tt.id
JOIN events e ON tt.event_id = e.id
WHERE t.validation_hash = $1;

-- name: ValidateTicketOnce :one
UPDATE tickets
SET is_validated = TRUE,
    validated_at = CURRENT_TIMESTAMP,
    validated_by_user_id = $2,
    validated_by_scanner_access_id = $3
WHERE id = $1 AND is_validated = FALSE
RETURNING validated_at;

-- name: GetUserTickets :many
SELECT t.*, tt.name as ticket_type_name, e.title as event_title, e.start_time
FROM tickets t
JOIN ticket_types tt ON t.ticket_type_id = tt.id
JOIN events e ON tt.event_id = e.id
WHERE t.user_id = $1
ORDER BY t.created_at DESC;
