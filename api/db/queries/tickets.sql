-- name: GetTicketTypesForEvent :many
SELECT * FROM ticket_types 
WHERE event_id = $1 
ORDER BY created_at ASC;

-- name: GetTicketTypeForUpdate :one
SELECT * FROM ticket_types 
WHERE id = $1 
FOR UPDATE;

-- name: CreateTicketType :exec
INSERT INTO ticket_types (event_id, name, price_ron, capacity, start_sales, end_sales)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: IncrementTicketsSold :exec
UPDATE ticket_types
SET tickets_sold = tickets_sold + $2
WHERE id = $1;

-- name: CreateOrder :one
INSERT INTO orders (user_id, event_id, email, total_amount, stripe_payment_intent_id, status)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateOrderStatus :exec
UPDATE orders
SET status = $2, stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id)
WHERE id = $1;

-- name: CreateTicket :one
INSERT INTO tickets (order_id, ticket_type_id, user_id, validation_hash)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetTicketByHash :one
SELECT t.*, tt.name as ticket_type_name, e.title as event_title
FROM tickets t
JOIN ticket_types tt ON t.ticket_type_id = tt.id
JOIN events e ON tt.event_id = e.id
WHERE t.validation_hash = $1;

-- name: ValidateTicket :exec
UPDATE tickets
SET is_validated = TRUE, validated_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: GetUserTickets :many
SELECT t.*, tt.name as ticket_type_name, e.title as event_title, e.start_time
FROM tickets t
JOIN ticket_types tt ON t.ticket_type_id = tt.id
JOIN events e ON tt.event_id = e.id
WHERE t.user_id = $1
ORDER BY t.created_at DESC;