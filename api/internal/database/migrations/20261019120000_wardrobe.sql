-- +goose Up
CREATE TABLE wardrobe_zones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    name varchar(60) NOT NULL,
    prefix varchar(8) NOT NULL CHECK (prefix ~ '^[A-Z]{1,8}$'),
    kind text NOT NULL CHECK (kind IN ('any','coat','bag')),
    capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 2000),
    enabled boolean NOT NULL DEFAULT true,
    revision integer NOT NULL DEFAULT 1,
    UNIQUE(event_id,prefix), UNIQUE(id,event_id)
);
CREATE TABLE wardrobe_slots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id uuid NOT NULL REFERENCES wardrobe_zones(id) ON DELETE CASCADE,
    number integer NOT NULL CHECK (number > 0),
    UNIQUE(zone_id,number), UNIQUE(id,zone_id)
);
CREATE TABLE wardrobe_staff (
    event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('operator','supervisor')),
    PRIMARY KEY(event_id,user_id)
);
CREATE TABLE wardrobe_deposits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    zone_id uuid NOT NULL,
    slot_id uuid NOT NULL,
    request_id uuid NOT NULL,
    request_hash text NOT NULL,
    status text NOT NULL CHECK (status IN ('reserved','stored','returned','cancelled')),
    items jsonb NOT NULL,
    remaining jsonb NOT NULL,
    revision integer NOT NULL DEFAULT 1,
    reserved_until timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
    created_at timestamptz NOT NULL DEFAULT now(),
    stored_at timestamptz,
    returned_at timestamptz,
    pickup_id uuid,
    pickup_items jsonb,
    pickup_expires_at timestamptz,
    pickup_approved_at timestamptz,
    FOREIGN KEY(zone_id,event_id) REFERENCES wardrobe_zones(id,event_id),
    FOREIGN KEY(slot_id,zone_id) REFERENCES wardrobe_slots(id,zone_id),
    UNIQUE(event_id,request_id)
);
CREATE UNIQUE INDEX wardrobe_one_active_slot ON wardrobe_deposits(slot_id) WHERE status IN ('reserved','stored');
CREATE INDEX wardrobe_customer_active ON wardrobe_deposits(user_id) WHERE status IN ('reserved','stored');
CREATE INDEX wardrobe_event_history ON wardrobe_deposits(event_id,created_at DESC,id DESC);
CREATE TABLE wardrobe_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    deposit_id uuid REFERENCES wardrobe_deposits(id) ON DELETE RESTRICT,
    actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
    action text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wardrobe_audit_event ON wardrobe_audit(event_id,id DESC);

-- +goose Down
-- A rollback must never discard records of property still held by a venue.
-- +goose StatementBegin
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM wardrobe_deposits WHERE status IN ('reserved','stored')) THEN
    RAISE EXCEPTION 'Return/cancel all wardrobe deposits before rollback';
  END IF;
END $$;
-- +goose StatementEnd
DROP TABLE wardrobe_audit;
DROP TABLE wardrobe_deposits;
DROP TABLE wardrobe_staff;
DROP TABLE wardrobe_slots;
DROP TABLE wardrobe_zones;
