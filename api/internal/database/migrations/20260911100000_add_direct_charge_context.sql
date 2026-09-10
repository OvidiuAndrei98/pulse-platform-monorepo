-- +goose Up
ALTER TABLE organizer_profiles
    ADD COLUMN stripe_charge_type VARCHAR(32);

ALTER TABLE organizer_profiles
    ADD CONSTRAINT organizer_profiles_stripe_charge_type_check
        CHECK (stripe_charge_type IS NULL OR stripe_charge_type IN ('destination', 'direct'));

ALTER TABLE orders
    ADD COLUMN stripe_connected_account_id VARCHAR(255),
    ADD COLUMN stripe_charge_type VARCHAR(32);

ALTER TABLE orders
    ADD CONSTRAINT orders_stripe_charge_type_check
        CHECK (stripe_charge_type IS NULL OR stripe_charge_type IN ('destination', 'direct')),
    ADD CONSTRAINT orders_stripe_charge_context_check
        CHECK (
            (stripe_connected_account_id IS NULL AND stripe_charge_type IS NULL)
            OR
            (stripe_connected_account_id IS NOT NULL AND stripe_charge_type IS NOT NULL)
        );

-- Existing ticket payments were destination charges. Snapshot the connected
-- account on the order before organizers reconnect with the direct-charge
-- configuration, so legacy refunds and reconciliation remain addressable.
UPDATE orders AS order_record
SET stripe_connected_account_id = profile.stripe_account_id,
    stripe_charge_type = 'destination'
FROM events AS event_record
JOIN organizer_profiles AS profile
  ON profile.user_id = event_record.organizer_id
WHERE order_record.event_id = event_record.id
  AND order_record.stripe_checkout_session_id IS NOT NULL
  AND profile.stripe_account_id IS NOT NULL;

UPDATE organizer_profiles
SET stripe_charge_type = 'destination'
WHERE stripe_account_id IS NOT NULL;

COMMENT ON COLUMN organizer_profiles.stripe_charge_type IS
    'Payment flow supported by the currently linked Stripe account. New Spottr accounts use direct charges.';

COMMENT ON COLUMN orders.stripe_connected_account_id IS
    'Immutable Stripe connected-account context in which this ticket checkout was created.';

COMMENT ON COLUMN orders.stripe_charge_type IS
    'Immutable Stripe charge flow used by this order: destination for legacy orders, direct for new orders.';

CREATE INDEX orders_stripe_connected_account_idx
    ON orders (stripe_connected_account_id)
    WHERE stripe_connected_account_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS orders_stripe_connected_account_idx;

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_stripe_charge_context_check,
    DROP CONSTRAINT IF EXISTS orders_stripe_charge_type_check,
    DROP COLUMN IF EXISTS stripe_charge_type,
    DROP COLUMN IF EXISTS stripe_connected_account_id;

ALTER TABLE organizer_profiles
    DROP CONSTRAINT IF EXISTS organizer_profiles_stripe_charge_type_check,
    DROP COLUMN IF EXISTS stripe_charge_type;
