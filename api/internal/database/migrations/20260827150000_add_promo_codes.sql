-- +goose Up
CREATE TABLE promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    code VARCHAR(40) NOT NULL,
    discount_percent INT NOT NULL CHECK (discount_percent BETWEEN 1 AND 90),
    max_redemptions INT CHECK (max_redemptions IS NULL OR max_redemptions > 0),
    redemptions_count INT NOT NULL DEFAULT 0 CHECK (redemptions_count >= 0),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (event_id, code),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

ALTER TABLE orders
    ADD COLUMN promo_code_id UUID REFERENCES promo_codes(id) ON DELETE SET NULL,
    ADD COLUMN discount_amount_ron INT NOT NULL DEFAULT 0;

CREATE INDEX promo_codes_event_idx ON promo_codes(event_id, active);

-- +goose Down
DROP INDEX IF EXISTS promo_codes_event_idx;
ALTER TABLE orders
    DROP COLUMN IF EXISTS discount_amount_ron,
    DROP COLUMN IF EXISTS promo_code_id;
DROP TABLE IF EXISTS promo_codes;
