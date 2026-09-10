-- +goose Up
-- One-time production cleanup requested for the legacy CODELAB demo organizer.
-- The target is deliberately resolved by the exact, normalized email address.
-- +goose StatementBegin
DO $$
DECLARE
    target_user_id UUID;
BEGIN
    SELECT id
    INTO target_user_id
    FROM users
    WHERE LOWER(email) = 'contact@code-lab.ro'
    LIMIT 1;

    IF target_user_id IS NULL THEN
        RAISE NOTICE 'CODELAB demo cleanup skipped: user contact@code-lab.ro was not found';
        RETURN;
    END IF;

    CREATE TEMP TABLE cleanup_codelab_order_ids (
        id UUID PRIMARY KEY
    ) ON COMMIT DROP;

    INSERT INTO cleanup_codelab_order_ids (id)
    SELECT orders.id
    FROM orders
    JOIN events ON events.id = orders.event_id
    WHERE events.organizer_id = target_user_id
       OR orders.user_id = target_user_id
       OR LOWER(orders.email) = 'contact@code-lab.ro';

    CREATE TEMP TABLE cleanup_codelab_ticket_type_ids (
        id UUID PRIMARY KEY
    ) ON COMMIT DROP;

    INSERT INTO cleanup_codelab_ticket_type_ids (id)
    SELECT DISTINCT items.ticket_type_id
    FROM order_items items
    JOIN cleanup_codelab_order_ids target ON target.id = items.order_id;

    CREATE TEMP TABLE cleanup_codelab_promo_code_ids (
        id UUID PRIMARY KEY
    ) ON COMMIT DROP;

    INSERT INTO cleanup_codelab_promo_code_ids (id)
    SELECT DISTINCT orders.promo_code_id
    FROM orders
    JOIN cleanup_codelab_order_ids target ON target.id = orders.id
    WHERE orders.promo_code_id IS NOT NULL;

    -- Customer invoice rows restrict order deletion and must be removed first.
    DELETE FROM billing_invoices
    WHERE order_id IN (SELECT id FROM cleanup_codelab_order_ids);

    -- Remove stale purchase notifications for the deleted demo sales.
    DELETE FROM notifications
    WHERE type = 'ticket_purchased'
      AND (
          user_id = target_user_id
          OR event_id IN (
              SELECT id
              FROM events
              WHERE organizer_id = target_user_id
          )
      );

    -- Tickets and order items are deleted through ON DELETE CASCADE.
    DELETE FROM orders
    WHERE id IN (SELECT id FROM cleanup_codelab_order_ids);

    -- Rebuild reservation counters from the remaining active orders. Recounting
    -- avoids subtracting failed orders whose reservations were already released.
    UPDATE ticket_types ticket_type
    SET tickets_sold = COALESCE((
        SELECT SUM(items.quantity)::INT
        FROM order_items items
        JOIN orders ON orders.id = items.order_id
        WHERE items.ticket_type_id = ticket_type.id
          AND orders.status IN ('pending', 'completed')
    ), 0)
    WHERE ticket_type.id IN (SELECT id FROM cleanup_codelab_ticket_type_ids);

    UPDATE promo_codes promo_code
    SET redemptions_count = (
        SELECT COUNT(*)::INT
        FROM orders
        WHERE orders.promo_code_id = promo_code.id
          AND orders.status IN ('pending', 'completed')
    )
    WHERE promo_code.id IN (SELECT id FROM cleanup_codelab_promo_code_ids);

    -- Remove only the mistakenly-issued August 2026 SPOTTR commission invoice.
    DELETE FROM platform_commission_invoices
    WHERE organizer_id = target_user_id
      AND period_start = DATE '2026-08-01';
END $$;
-- +goose StatementEnd

-- +goose Down
-- This is an intentionally irreversible cleanup of demo financial data.
SELECT 1;
