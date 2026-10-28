-- name: CreateEventCancellationRequest :one
WITH owned_event AS (
    SELECT id, organizer_id, status, publish_at, is_live
    FROM events
    WHERE events.id = sqlc.arg(event_id)
      AND events.organizer_id = sqlc.arg(organizer_id)
      AND events.status IN ('published', 'scheduled')
    FOR UPDATE
), created AS (
    INSERT INTO event_cancellation_requests (
        event_id, organizer_id, previous_event_status, previous_publish_at, previous_is_live, reason, evidence_url
    )
    SELECT id, organizer_id, status, publish_at, is_live, sqlc.arg(reason), sqlc.narg(evidence_url)
    FROM owned_event
    RETURNING *
)
UPDATE events
SET status = 'cancel_pending', is_live = FALSE, publish_at = NULL
WHERE id = (SELECT event_id FROM created)
RETURNING (SELECT id FROM created) AS request_id;

-- name: GetOrganizerEventCancellationRequest :one
SELECT request.*
FROM event_cancellation_requests request
WHERE request.event_id = sqlc.arg(event_id)
  AND request.organizer_id = sqlc.arg(organizer_id)
ORDER BY request.created_at DESC
LIMIT 1;

-- name: ListOrganizerRefundsRequiringAttention :many
SELECT orders.id AS order_id,
       orders.event_id,
       event.title AS event_title,
       event.organizer_id,
       orders.email AS buyer_email,
       ((orders.total_amount::BIGINT * 100) + orders.customer_ticketing_fee_bani)::BIGINT AS customer_total_bani,
       orders.stripe_amount_refunded_bani AS refunded_amount_bani,
       GREATEST(0, ((orders.total_amount::BIGINT * 100) + orders.customer_ticketing_fee_bani) - orders.stripe_amount_refunded_bani)::BIGINT AS remaining_amount_bani,
       orders.platform_fee_bani::BIGINT AS platform_fee_bani,
       orders.platform_fee_status,
       orders.stripe_refund_status,
       COALESCE(orders.refund_origin, 'stripe_dashboard')::TEXT AS refund_origin,
       COALESCE(operation.status, 'needs_review')::TEXT AS operation_status,
       operation.error_message,
       COALESCE((SELECT SUM(items.quantity)::BIGINT FROM order_items items WHERE items.order_id = orders.id), 0)::BIGINT AS ticket_count,
       COALESCE(orders.stripe_livemode, FALSE)::BOOLEAN AS stripe_livemode,
       orders.created_at AS purchased_at,
       COALESCE(orders.stripe_refund_updated_at, operation.updated_at, orders.created_at) AS updated_at
FROM orders
JOIN events event ON event.id = orders.event_id
LEFT JOIN order_refund_operations operation ON operation.order_id = orders.id
WHERE event.organizer_id = sqlc.arg(organizer_id)
  AND orders.stripe_refund_needs_attention IS TRUE
ORDER BY COALESCE(orders.stripe_refund_updated_at, operation.updated_at, orders.created_at) DESC;

-- name: ListAdminRefundsRequiringAttention :many
SELECT orders.id AS order_id,
       orders.event_id,
       event.title AS event_title,
       event.organizer_id,
       users.email AS organizer_email,
       profile.company_name,
       orders.email AS buyer_email,
       ((orders.total_amount::BIGINT * 100) + orders.customer_ticketing_fee_bani)::BIGINT AS customer_total_bani,
       orders.stripe_amount_refunded_bani AS refunded_amount_bani,
       GREATEST(0, ((orders.total_amount::BIGINT * 100) + orders.customer_ticketing_fee_bani) - orders.stripe_amount_refunded_bani)::BIGINT AS remaining_amount_bani,
       orders.platform_fee_bani::BIGINT AS platform_fee_bani,
       orders.platform_fee_status,
       orders.stripe_refund_status,
       COALESCE(orders.refund_origin, 'stripe_dashboard')::TEXT AS refund_origin,
       COALESCE(operation.status, 'needs_review')::TEXT AS operation_status,
       operation.error_message,
       COALESCE((SELECT SUM(items.quantity)::BIGINT FROM order_items items WHERE items.order_id = orders.id), 0)::BIGINT AS ticket_count,
       COALESCE(orders.stripe_livemode, FALSE)::BOOLEAN AS stripe_livemode,
       orders.created_at AS purchased_at,
       COALESCE(orders.stripe_refund_updated_at, operation.updated_at, orders.created_at) AS updated_at
FROM orders
JOIN events event ON event.id = orders.event_id
JOIN users ON users.id = event.organizer_id
JOIN organizer_profiles profile ON profile.user_id = event.organizer_id
LEFT JOIN order_refund_operations operation ON operation.order_id = orders.id
WHERE orders.stripe_refund_needs_attention IS TRUE
ORDER BY COALESCE(orders.stripe_refund_updated_at, operation.updated_at, orders.created_at) DESC;

-- name: GetOrganizerRefundAttentionOrder :one
SELECT orders.*
FROM orders
JOIN events ON events.id = orders.event_id
WHERE orders.id = sqlc.arg(order_id)
  AND events.organizer_id = sqlc.arg(organizer_id)
  AND orders.stripe_refund_needs_attention IS TRUE;

-- name: GetAdminRefundAttentionOrder :one
SELECT orders.*
FROM orders
WHERE orders.id = sqlc.arg(order_id)
  AND orders.stripe_refund_needs_attention IS TRUE;

-- name: ListAdminEventCancellationRequests :many
SELECT request.*,
       event.title AS event_title,
       event.start_time,
       users.email AS organizer_email,
       profile.company_name,
       (SELECT COUNT(*)::BIGINT FROM orders WHERE orders.event_id = request.event_id AND orders.status IN ('completed', 'refunded') AND orders.stripe_livemode IS TRUE) AS order_count,
       (SELECT COALESCE(SUM(items.quantity), 0)::BIGINT FROM order_items items JOIN orders ON orders.id = items.order_id WHERE orders.event_id = request.event_id AND orders.status IN ('completed', 'refunded') AND orders.stripe_livemode IS TRUE) AS ticket_count,
       (SELECT COALESCE(SUM((orders.total_amount::BIGINT * 100) + orders.customer_ticketing_fee_bani), 0)::BIGINT FROM orders WHERE orders.event_id = request.event_id AND orders.status IN ('completed', 'refunded') AND orders.stripe_livemode IS TRUE) AS customer_total_bani,
       (SELECT COALESCE(SUM(orders.platform_fee_bani), 0)::BIGINT FROM orders WHERE orders.event_id = request.event_id AND orders.status IN ('completed', 'refunded') AND orders.stripe_livemode IS TRUE) AS platform_fee_bani,
       (SELECT COALESCE(SUM(orders.stripe_amount_refunded_bani), 0)::BIGINT FROM orders WHERE orders.event_id = request.event_id AND orders.stripe_livemode IS TRUE) AS already_refunded_bani,
       (SELECT COUNT(*)::BIGINT FROM orders WHERE orders.event_id = request.event_id AND orders.status = 'refunded' AND orders.stripe_livemode IS TRUE) AS succeeded_refunds,
       (SELECT COUNT(*)::BIGINT FROM order_refund_operations operation WHERE operation.cancellation_request_id = request.id AND operation.status IN ('pending', 'processing', 'stripe_pending')) AS pending_refunds,
       (SELECT COUNT(*)::BIGINT FROM order_refund_operations operation WHERE operation.cancellation_request_id = request.id AND operation.status IN ('failed', 'needs_review')) AS failed_refunds
FROM event_cancellation_requests request
JOIN events event ON event.id = request.event_id
JOIN users ON users.id = request.organizer_id
JOIN organizer_profiles profile ON profile.user_id = request.organizer_id
ORDER BY CASE request.status WHEN 'pending' THEN 0 WHEN 'failed' THEN 1 WHEN 'refunding' THEN 2 ELSE 3 END,
         request.created_at DESC;

-- name: ApproveEventCancellation :one
WITH reviewed AS (
    UPDATE event_cancellation_requests
    SET status = 'refunding', fee_policy = sqlc.arg(fee_policy), admin_note = sqlc.narg(admin_note),
        reviewed_by = sqlc.arg(reviewed_by), reviewed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE event_cancellation_requests.id = sqlc.arg(id) AND event_cancellation_requests.status = 'pending'
    RETURNING *
), fees_held AS (
    UPDATE orders
    SET platform_fee_status = 'refund_pending', refund_origin = 'event_cancellation'
    FROM reviewed
    WHERE orders.event_id = reviewed.event_id
      AND orders.status = 'completed'
      AND orders.stripe_livemode IS TRUE
      AND reviewed.fee_policy = 'refund'
    RETURNING orders.id
), free_bookings_cancelled AS (
    UPDATE orders
    SET status = 'refunded',
        refund_origin = 'event_cancellation',
        stripe_refund_needs_attention = FALSE,
        platform_fee_status = 'refunded',
        platform_fee_refunded_bani = 0
    FROM reviewed
    WHERE orders.event_id = reviewed.event_id
      AND orders.status = 'completed'
      AND orders.total_amount = 0
      AND orders.customer_ticketing_fee_bani = 0
      AND orders.stripe_payment_intent_id IS NULL
      AND orders.stripe_checkout_session_id IS NULL
    RETURNING orders.id
), jobs AS (
    INSERT INTO order_refund_operations (order_id, cancellation_request_id, source, fee_policy, refund_amount_bani)
    SELECT orders.id, reviewed.id, 'event_cancellation', reviewed.fee_policy,
           (orders.total_amount::BIGINT * 100) + orders.customer_ticketing_fee_bani
    FROM reviewed
    JOIN orders ON orders.event_id = reviewed.event_id
    WHERE orders.status = 'completed'
      AND orders.stripe_livemode IS TRUE
    ON CONFLICT (order_id) DO UPDATE SET
        cancellation_request_id = EXCLUDED.cancellation_request_id,
        source = EXCLUDED.source,
        fee_policy = EXCLUDED.fee_policy,
        status = CASE WHEN order_refund_operations.status = 'succeeded' THEN 'succeeded' ELSE 'pending' END,
        next_attempt_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    RETURNING order_id
)
UPDATE events
SET status = 'refunding', is_live = FALSE, publish_at = NULL
WHERE id = (SELECT event_id FROM reviewed)
RETURNING (SELECT id FROM reviewed) AS request_id;

-- name: RejectEventCancellation :one
WITH reviewed AS (
    UPDATE event_cancellation_requests
    SET status = 'rejected', admin_note = sqlc.narg(admin_note), reviewed_by = sqlc.arg(reviewed_by),
        reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE event_cancellation_requests.id = sqlc.arg(id) AND event_cancellation_requests.status = 'pending'
    RETURNING *
)
UPDATE events
SET status = (SELECT previous_event_status FROM reviewed),
    publish_at = (SELECT previous_publish_at FROM reviewed),
    is_live = (SELECT previous_is_live FROM reviewed)
WHERE id = (SELECT event_id FROM reviewed)
RETURNING (SELECT id FROM reviewed) AS request_id;

-- name: ClaimOrderRefundOperations :many
WITH claimable AS (
    SELECT id
    FROM order_refund_operations
    WHERE attempt_count < 10
      AND ((status IN ('pending', 'failed') AND next_attempt_at <= CURRENT_TIMESTAMP)
        OR (status = 'processing' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes')
        OR (status = 'stripe_pending' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '2 minutes'))
    ORDER BY next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT sqlc.arg(batch_size)
)
UPDATE order_refund_operations operation
SET status = 'processing', attempt_count = attempt_count + 1,
    error_message = NULL, updated_at = CURRENT_TIMESTAMP
FROM claimable
WHERE operation.id = claimable.id
RETURNING operation.*;

-- name: GetOrderRefundExecutionData :one
SELECT operation.*,
       orders.stripe_payment_intent_id,
       orders.stripe_charge_id,
       orders.stripe_connected_account_id,
       orders.stripe_charge_type,
       orders.stripe_livemode,
       orders.platform_fee_bani,
       orders.platform_fee_status,
       orders.stripe_amount_refunded_bani,
       orders.status AS order_status
FROM order_refund_operations operation
JOIN orders ON orders.id = operation.order_id
WHERE operation.id = $1;

-- name: MarkOrderRefundSubmitted :exec
UPDATE order_refund_operations
SET status = sqlc.arg(status), stripe_refund_id = sqlc.arg(stripe_refund_id),
    stripe_application_fee_id = COALESCE(sqlc.narg(stripe_application_fee_id), stripe_application_fee_id),
    error_message = NULL, updated_at = CURRENT_TIMESTAMP
WHERE order_refund_operations.id = sqlc.arg(id);

-- name: MarkOrderRefundFailed :exec
WITH failed_operation AS (
    UPDATE order_refund_operations
    SET status = CASE WHEN sqlc.arg(needs_review)::BOOLEAN THEN 'needs_review' ELSE 'failed' END,
        error_message = sqlc.arg(error_message),
        next_attempt_at = CURRENT_TIMESTAMP + make_interval(secs => sqlc.arg(retry_seconds)::INT),
        updated_at = CURRENT_TIMESTAMP
    WHERE order_refund_operations.id = sqlc.arg(id)
    RETURNING cancellation_request_id
)
UPDATE event_cancellation_requests request
SET status = 'failed', updated_at = CURRENT_TIMESTAMP
FROM failed_operation
WHERE sqlc.arg(needs_review)::BOOLEAN
  AND request.id = failed_operation.cancellation_request_id;

-- name: RetryEventCancellationRefunds :execrows
WITH retried AS (
    UPDATE order_refund_operations
    SET status = 'pending', attempt_count = 0, next_attempt_at = CURRENT_TIMESTAMP,
        error_message = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE cancellation_request_id = sqlc.arg(id)
      AND status IN ('failed', 'needs_review')
    RETURNING cancellation_request_id
)
UPDATE event_cancellation_requests
SET status = 'refunding', updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT cancellation_request_id FROM retried);

-- name: UpsertManualRefundOperation :one
INSERT INTO order_refund_operations (
    order_id, source, fee_policy, status, stripe_refund_id, refund_amount_bani
)
VALUES (sqlc.arg(order_id), 'stripe_dashboard', sqlc.arg(fee_policy), sqlc.arg(status), sqlc.arg(stripe_refund_id), sqlc.arg(refund_amount_bani))
ON CONFLICT (order_id) DO UPDATE SET
    source = CASE WHEN order_refund_operations.source = 'event_cancellation' THEN order_refund_operations.source ELSE 'stripe_dashboard' END,
    fee_policy = CASE WHEN order_refund_operations.source = 'event_cancellation' THEN order_refund_operations.fee_policy ELSE EXCLUDED.fee_policy END,
    status = CASE WHEN order_refund_operations.source = 'event_cancellation' THEN order_refund_operations.status ELSE EXCLUDED.status END,
    stripe_refund_id = COALESCE(order_refund_operations.stripe_refund_id, EXCLUDED.stripe_refund_id),
    refund_amount_bani = GREATEST(order_refund_operations.refund_amount_bani, EXCLUDED.refund_amount_bani),
    updated_at = CURRENT_TIMESTAMP
RETURNING *;

-- name: GetOrderRefundOperation :one
SELECT * FROM order_refund_operations WHERE order_id = $1;

-- name: MarkOrderPlatformFeeRefunded :exec
WITH refunded_order AS (
    UPDATE orders
    SET platform_fee_status = 'refunded',
        platform_fee_refunded_bani = platform_fee_bani,
        invoice_service_fee_state = CASE WHEN invoice_service_fee_bani>0 THEN 'refunded' ELSE invoice_service_fee_state END,
        refund_origin = sqlc.arg(refund_origin),
        stripe_refund_needs_attention = FALSE
    WHERE orders.id = sqlc.arg(order_id)
    RETURNING event_id, COALESCE(completed_at, created_at) AS paid_at
)
UPDATE platform_commission_invoices invoice
SET status = 'needs_review',
    error_message = 'Un comision inclus in aceasta factura a fost returnat ulterior. Este necesara o factura de corectie/storno.',
    updated_at = CURRENT_TIMESTAMP
FROM refunded_order
JOIN events ON events.id = refunded_order.event_id
WHERE invoice.organizer_id = events.organizer_id
  AND invoice.status = 'issued'
  AND refunded_order.paid_at >= (invoice.period_start::TIMESTAMP AT TIME ZONE 'Europe/Bucharest')
  AND refunded_order.paid_at < (invoice.period_end::TIMESTAMP AT TIME ZONE 'Europe/Bucharest');

-- name: MarkOrderPlatformFeeRetained :exec
UPDATE orders
SET platform_fee_status = 'earned', refund_origin = sqlc.arg(refund_origin)
WHERE id = sqlc.arg(order_id);

-- name: MarkOrderPlatformFeePending :exec
UPDATE orders
SET platform_fee_status = sqlc.arg(status), refund_origin = sqlc.arg(refund_origin),
    stripe_refund_needs_attention = sqlc.arg(needs_attention)::BOOLEAN
WHERE id = sqlc.arg(order_id);

-- name: MarkOrderFeeRefundCompleted :exec
UPDATE order_refund_operations
SET status = 'succeeded', stripe_application_fee_id = sqlc.arg(stripe_application_fee_id),
    stripe_fee_refund_id = sqlc.arg(stripe_fee_refund_id),
    application_fee_refunded_bani = sqlc.arg(application_fee_refunded_bani),
    error_message = NULL, updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id);

-- name: MarkOrderApplicationFeeRefunded :exec
UPDATE order_refund_operations
SET status = 'pending', stripe_application_fee_id = sqlc.arg(stripe_application_fee_id),
    stripe_fee_refund_id = sqlc.arg(stripe_fee_refund_id),
    application_fee_refunded_bani = sqlc.arg(application_fee_refunded_bani),
    next_attempt_at = CURRENT_TIMESTAMP, error_message = NULL, updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id);

-- name: FinalizeCompletedCancellationRequests :execrows
WITH completed AS (
    UPDATE event_cancellation_requests request
    SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE request.status IN ('refunding', 'failed')
      AND EXISTS (SELECT 1 FROM order_refund_operations operation WHERE operation.cancellation_request_id = request.id)
      AND NOT EXISTS (
          SELECT 1 FROM order_refund_operations operation
          WHERE operation.cancellation_request_id = request.id
            AND operation.status <> 'succeeded'
      )
    RETURNING event_id
)
UPDATE events
SET status = 'cancelled', is_live = FALSE
WHERE id IN (SELECT event_id FROM completed);

-- name: FinalizeEmptyCancellationRequests :execrows
WITH completed AS (
    UPDATE event_cancellation_requests request
    SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE request.status = 'refunding'
      AND NOT EXISTS (SELECT 1 FROM order_refund_operations operation WHERE operation.cancellation_request_id = request.id)
    RETURNING event_id
)
UPDATE events
SET status = 'cancelled', is_live = FALSE
WHERE id IN (SELECT event_id FROM completed);
