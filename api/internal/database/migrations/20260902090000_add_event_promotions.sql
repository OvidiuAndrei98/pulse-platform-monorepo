-- +goose Up
CREATE TYPE promotion_plan AS ENUM ('one_day', 'thu_sat', 'full_week');
CREATE TYPE promotion_status AS ENUM ('pending_payment', 'scheduled', 'active', 'completed', 'cancelled');

CREATE TABLE promotion_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan promotion_plan NOT NULL,
    status promotion_status NOT NULL DEFAULT 'pending_payment',
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    amount_bani INT NOT NULL CHECK (amount_bani > 0),
    impressions_count BIGINT NOT NULL DEFAULT 0,
    clicks_count BIGINT NOT NULL DEFAULT 0,
    stripe_checkout_session_id VARCHAR(255) UNIQUE,
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (ends_at > starts_at)
);

CREATE TABLE promotion_metric_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES promotion_campaigns(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    viewer_key VARCHAR(100) NOT NULL,
    metric VARCHAR(20) NOT NULL CHECK (metric IN ('impression', 'click')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (campaign_id, viewer_key, metric)
);

CREATE INDEX promotion_campaigns_delivery_idx
    ON promotion_campaigns (starts_at, ends_at)
    WHERE status IN ('scheduled', 'active');
CREATE INDEX promotion_campaigns_organizer_idx ON promotion_campaigns (organizer_id, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS promotion_campaigns_organizer_idx;
DROP INDEX IF EXISTS promotion_campaigns_delivery_idx;
DROP TABLE IF EXISTS promotion_metric_events;
DROP TABLE IF EXISTS promotion_campaigns;
DROP TYPE IF EXISTS promotion_status;
DROP TYPE IF EXISTS promotion_plan;
