-- +goose Up
CREATE TYPE promotion_placement AS ENUM ('home_banner', 'feed');

ALTER TABLE promotion_campaigns
    ADD COLUMN placement promotion_placement NOT NULL DEFAULT 'home_banner';

CREATE INDEX promotion_campaigns_placement_delivery_idx
    ON promotion_campaigns (placement, starts_at, ends_at)
    WHERE status IN ('pending_payment', 'scheduled', 'active');

-- +goose Down
DROP INDEX IF EXISTS promotion_campaigns_placement_delivery_idx;
ALTER TABLE promotion_campaigns DROP COLUMN IF EXISTS placement;
DROP TYPE IF EXISTS promotion_placement;
