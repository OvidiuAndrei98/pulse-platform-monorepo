-- name: GetTicketTypesForEvent :many
SELECT * FROM ticket_types
WHERE event_id = $1 
ORDER BY created_at ASC;

-- name: LockPublishedEventForCheckout :one
SELECT id
FROM events
WHERE id = $1 AND status = 'published'
FOR SHARE;

-- name: GetTicketTypeForUpdate :one
SELECT * FROM ticket_types
WHERE id = $1 
FOR UPDATE;

-- name: GetAvailablePromoCode :one
SELECT id, code, discount_percent
FROM promo_codes
WHERE event_id = $1
  AND code = $2
  AND active = TRUE
  AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
  AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
  AND (max_redemptions IS NULL OR redemptions_count < max_redemptions);

-- name: GetAvailablePromoCodeForUpdate :one
SELECT id, code, discount_percent
FROM promo_codes
WHERE event_id = $1
  AND code = $2
  AND active = TRUE
  AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
  AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
  AND (max_redemptions IS NULL OR redemptions_count < max_redemptions)
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

-- name: IncrementPromoCodeRedemption :exec
UPDATE promo_codes
SET redemptions_count = redemptions_count + 1
WHERE id = $1;

-- name: DecrementPromoCodeRedemption :exec
UPDATE promo_codes
SET redemptions_count = GREATEST(0, redemptions_count - 1)
WHERE id = $1;

-- name: CreateOrder :one
INSERT INTO orders (user_id, event_id, email, total_amount, stripe_payment_intent_id, status)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: CreateCheckoutOrder :one
INSERT INTO orders (
    user_id, event_id, email, total_amount, platform_fee_bani, customer_ticketing_fee_bani, status,
    promo_code_id, discount_amount_ron, invoice_requested, billing_type,
    billing_name, billing_tax_id, billing_registration_number, billing_address,
    billing_city, billing_county, billing_sector, billing_country,
    stripe_connected_account_id, stripe_charge_type
)
VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15, $16, $17, $18, $19,
    $20, $21
)
RETURNING *;

-- name: ListOrganizerFinanceEvents :many
SELECT
    e.id AS event_id,
    e.title AS event_title,
    e.start_time,
    COALESCE((
        SELECT SUM(o.total_amount)::bigint
        FROM orders o
        WHERE o.event_id = e.id AND o.status = 'completed'
    ), 0)::bigint AS gross_revenue_ron,
    COALESCE((
        SELECT SUM(o.customer_ticketing_fee_bani)::bigint
        FROM orders o
        WHERE o.event_id = e.id AND o.status = 'completed'
    ), 0)::bigint AS customer_ticketing_fee_bani,
    COALESCE((
        SELECT SUM(o.platform_fee_bani - o.platform_fee_refunded_bani)::bigint
        FROM orders o
        WHERE o.event_id = e.id AND o.status IN ('completed', 'refunded') AND o.platform_fee_status = 'earned'
    ), 0)::bigint AS platform_fee_bani,
    COALESCE((
        SELECT COUNT(*)::bigint
        FROM tickets t
        JOIN orders o ON o.id = t.order_id
        WHERE o.event_id = e.id AND o.status = 'completed'
    ), 0)::bigint AS tickets_sold,
    COALESCE((
        SELECT COUNT(*)::bigint
        FROM orders o
        WHERE o.event_id = e.id AND o.stripe_refund_needs_attention = TRUE
    ), 0)::bigint AS refunds_needing_attention
FROM events e
WHERE e.organizer_id = $1
ORDER BY e.start_time DESC;

-- name: UpdateOrderCheckoutSession :exec
UPDATE orders
SET stripe_checkout_session_id = $2,
    stripe_livemode = sqlc.arg(stripe_livemode)::BOOLEAN
WHERE id = $1;

-- name: SetOrderStripeLivemode :exec
UPDATE orders
SET stripe_livemode = sqlc.arg(stripe_livemode)::BOOLEAN
WHERE id = $1;

-- name: GetOrderForUpdate :one
SELECT * FROM orders
WHERE id = $1
FOR UPDATE;

-- name: GetOrderByCheckoutSession :one
SELECT * FROM orders
WHERE stripe_checkout_session_id = $1;

-- name: ListPendingDirectChargeCheckoutsForReconciliation :many
SELECT * FROM orders
WHERE status = 'pending'
  AND stripe_checkout_session_id IS NOT NULL
  AND stripe_connected_account_id IS NOT NULL
  AND stripe_charge_type = 'direct'
  AND created_at <= CURRENT_TIMESTAMP - INTERVAL '15 seconds'
ORDER BY created_at ASC
LIMIT 50;

-- name: ListRecentCompletedOrdersWithPendingTicketEmail :many
SELECT * FROM orders
WHERE status = 'completed'
  AND ticket_email_sent_at IS NULL
  AND completed_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  AND EXISTS (SELECT 1 FROM tickets WHERE tickets.order_id = orders.id)
ORDER BY completed_at ASC
LIMIT 50;

-- name: GetOrderByStripePaymentIntent :one
SELECT * FROM orders
WHERE stripe_payment_intent_id = $1;

-- name: GetOrderByStripeChargeID :one
SELECT * FROM orders
WHERE stripe_charge_id = $1;

-- name: UpdateOrderRefundState :exec
UPDATE orders
SET stripe_charge_id = COALESCE(NULLIF(sqlc.arg(stripe_charge_id)::TEXT, ''), stripe_charge_id),
    stripe_amount_refunded_bani = GREATEST(stripe_amount_refunded_bani, sqlc.arg(amount_refunded_bani)::BIGINT),
    stripe_refund_status = sqlc.arg(refund_status),
    stripe_refund_needs_attention = sqlc.arg(needs_attention)::BOOLEAN,
    stripe_refund_updated_at = CURRENT_TIMESTAMP,
    status = CASE WHEN sqlc.arg(mark_refunded)::BOOLEAN THEN 'refunded'::order_status ELSE status END
WHERE id = sqlc.arg(id);

-- name: UpdateOrderStatus :exec
UPDATE orders
SET status = sqlc.arg(status)::order_status,
    stripe_payment_intent_id = COALESCE(sqlc.narg(stripe_payment_intent_id)::TEXT, stripe_payment_intent_id),
    completed_at = CASE
        WHEN sqlc.arg(status)::order_status = 'completed'::order_status AND completed_at IS NULL THEN CURRENT_TIMESTAMP
        ELSE completed_at
    END
WHERE id = sqlc.arg(id);

-- name: ListOrderTicketEmailDetails :many
SELECT o.email, o.user_id, o.ticket_email_sent_at, e.title AS event_title,
       e.location_name, tt.name AS ticket_type_name, t.validation_hash
FROM orders o
JOIN events e ON e.id = o.event_id
JOIN tickets t ON t.order_id = o.id
JOIN ticket_types tt ON tt.id = t.ticket_type_id
WHERE o.id = $1
ORDER BY t.created_at ASC;

-- name: MarkTicketEmailSent :exec
UPDATE orders
SET ticket_email_sent_at = CURRENT_TIMESTAMP
WHERE id = $1 AND ticket_email_sent_at IS NULL;

-- name: AssignGuestOrdersToUser :exec
UPDATE orders o
SET user_id = $1
FROM users u
WHERE u.id = $1
  AND o.user_id IS NULL
  AND o.status = 'completed'
  AND LOWER(o.email) = LOWER(u.email);

-- name: AssignGuestTicketsToUser :exec
UPDATE tickets t
SET user_id = $1
FROM orders o
WHERE t.order_id = o.id
  AND t.user_id IS NULL
  AND o.user_id = $1;

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
WHERE (e.organizer_id = $1 OR staff.user_id IS NOT NULL)
  AND e.status = 'published'
  AND e.end_time > NOW()
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
JOIN orders o ON o.id = t.order_id
WHERE t.validation_hash = $1 AND o.status = 'completed';

-- name: ValidateTicketOnce :one
UPDATE tickets
SET is_validated = TRUE,
    validated_at = CURRENT_TIMESTAMP,
    validated_by_user_id = $2,
    validated_by_scanner_access_id = $3
WHERE tickets.id = $1 AND tickets.is_validated = FALSE
  AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = tickets.order_id AND o.status = 'completed'
  )
RETURNING validated_at;

-- name: ListOfflineValidationTickets :many
SELECT t.id, t.validation_hash, tt.name AS ticket_type_name
FROM tickets t
JOIN ticket_types tt ON tt.id = t.ticket_type_id
JOIN orders o ON o.id = t.order_id
WHERE tt.event_id = $1
  AND o.status = 'completed'
  AND t.is_validated = FALSE
ORDER BY t.created_at ASC;

-- name: ListOfflineInvitationTickets :many
SELECT i.id, i.validation_hash, COALESCE(tt.name, 'Invitatie') AS ticket_type_name
FROM invitation_tickets i
LEFT JOIN ticket_types tt ON tt.id = i.ticket_type_id
WHERE i.event_id = $1
  AND i.revoked_at IS NULL
  AND i.validated_at IS NULL
ORDER BY i.created_at ASC;

-- name: CreateOfflineValidationSnapshot :one
INSERT INTO offline_validation_snapshots (event_id, created_by_user_id, ticket_count, expires_at)
VALUES ($1, $2, $3, $4)
RETURNING id, event_id, created_by_user_id, ticket_count, expires_at, created_at;

-- name: GetOfflineValidationSnapshotForSync :one
SELECT id, event_id, created_by_user_id, ticket_count, expires_at, created_at
FROM offline_validation_snapshots
WHERE id = $1 AND event_id = $2 AND created_by_user_id = $3;

-- name: CreateOfflineTicketValidation :one
INSERT INTO offline_ticket_validations (
    client_scan_id, snapshot_id, event_id, validated_by_user_id,
    device_id, validation_hash, scanned_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (client_scan_id) DO NOTHING
RETURNING id;

-- name: GetOfflineTicketValidationByClientScanID :one
SELECT o.client_scan_id, o.result, o.server_validated_at,
       COALESCE(t.id, '00000000-0000-0000-0000-000000000000'::uuid) AS ticket_id,
       COALESCE(tt.name, '') AS ticket_type,
       COALESCE(e.title, '') AS event_title
FROM offline_ticket_validations o
LEFT JOIN tickets t ON t.id = o.ticket_id
LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
LEFT JOIN events e ON e.id = o.event_id
WHERE o.client_scan_id = $1
  AND o.event_id = $2
  AND o.validated_by_user_id = $3;

-- name: CompleteOfflineTicketValidation :exec
UPDATE offline_ticket_validations
SET ticket_id = $2,
    result = $3,
    synced_at = CURRENT_TIMESTAMP,
    server_validated_at = $4
WHERE id = $1;

-- name: GetUserTickets :many
SELECT t.*, tt.name AS ticket_type_name, e.id AS event_id, e.title AS event_title,
       e.location_name, e.start_time, e.end_time,
       COALESCE(oi.unit_price_ron, tt.price_ron) AS unit_price_ron,
       COALESCE(op.company_name, '') AS organizer_company_name,
       COALESCE(op.cui, '') AS organizer_cui,
       COALESCE(op.fiscal_address, '') AS organizer_fiscal_address
FROM tickets t
JOIN ticket_types tt ON t.ticket_type_id = tt.id
JOIN events e ON tt.event_id = e.id
JOIN orders o ON o.id = t.order_id
LEFT JOIN order_items oi ON oi.order_id = t.order_id AND oi.ticket_type_id = t.ticket_type_id
LEFT JOIN organizer_profiles op ON op.user_id = e.organizer_id
WHERE t.user_id = $1 AND o.status = 'completed'
ORDER BY t.created_at DESC;

-- name: ListUserOrders :many
SELECT o.id, o.status, o.total_amount, o.created_at, o.stripe_payment_intent_id,
       o.invoice_requested,
       e.id AS event_id, e.title AS event_title, e.location_name, e.start_time,
       invoice.status AS invoice_status,
       invoice.external_series AS invoice_series,
       invoice.external_number AS invoice_number,
       invoice.document_url AS invoice_document_url,
       invoice.issued_at AS invoice_issued_at
FROM orders o
JOIN events e ON e.id = o.event_id
LEFT JOIN billing_invoices invoice ON invoice.order_id = o.id
WHERE o.user_id = $1
ORDER BY o.created_at DESC;

-- name: GetInvitationForValidation :one
SELECT i.id, i.label, COALESCE(tt.name, '') AS ticket_type,
       i.validated_at, i.revoked_at
FROM invitation_tickets i
LEFT JOIN ticket_types tt ON tt.id = i.ticket_type_id
WHERE i.event_id = $1 AND i.validation_hash = $2;

-- name: MarkInvitationValidated :one
UPDATE invitation_tickets
SET validated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND validated_at IS NULL AND revoked_at IS NULL
RETURNING validated_at;

-- name: GetInvitationTicketType :one
SELECT name
FROM ticket_types
WHERE id = $1 AND event_id = $2;

-- name: CreateInvitationTicket :one
INSERT INTO invitation_tickets (
    event_id, ticket_type_id, created_by, label, validation_hash, batch_id, batch_index
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, created_at;

-- name: ListInvitationsForEvent :many
SELECT i.id, i.label, i.validation_hash, COALESCE(tt.name, '') AS ticket_type,
       i.validated_at, i.revoked_at, i.created_at, i.batch_id, i.batch_index
FROM invitation_tickets i
LEFT JOIN ticket_types tt ON tt.id = i.ticket_type_id
WHERE i.event_id = $1
ORDER BY i.created_at DESC, i.batch_index ASC;

-- name: RevokeInvitationTicket :execrows
UPDATE invitation_tickets
SET revoked_at = CURRENT_TIMESTAMP
WHERE id = $1 AND event_id = $2 AND revoked_at IS NULL AND validated_at IS NULL;

-- name: DeleteRevokedInvitationTicket :execrows
DELETE FROM invitation_tickets
WHERE id = $1 AND event_id = $2 AND revoked_at IS NOT NULL;
