-- name: ActivateScheduledPromotionCampaigns :exec
UPDATE promotion_campaigns
SET status = 'active'
WHERE status = 'scheduled'
  AND starts_at <= CURRENT_TIMESTAMP
  AND ends_at > CURRENT_TIMESTAMP;

-- name: CompleteExpiredPromotionCampaigns :exec
UPDATE promotion_campaigns
SET status = 'completed'
WHERE status IN ('scheduled', 'active')
  AND ends_at <= CURRENT_TIMESTAMP;

-- name: PromotionCampaignOverlaps :one
SELECT EXISTS (
    SELECT 1
    FROM promotion_campaigns
    WHERE event_id = sqlc.arg(event_id)
      AND status IN ('pending_payment', 'scheduled', 'active')
      AND starts_at < sqlc.arg(ends_at)
      AND ends_at > sqlc.arg(starts_at)
);

-- name: LockHomeBannerPromotionCapacity :exec
SELECT pg_advisory_xact_lock(73052026);

-- name: LockPromotionEvent :exec
SELECT pg_advisory_xact_lock(hashtextextended((sqlc.arg(event_id)::uuid)::text, 0));

-- name: HomeBannerPromotionPeakOccupancy :one
WITH relevant_campaigns AS (
    SELECT starts_at, ends_at
    FROM promotion_campaigns
    WHERE placement = 'home_banner'
      AND status IN ('pending_payment', 'scheduled', 'active')
      AND starts_at < sqlc.arg(ends_at)
      AND ends_at > sqlc.arg(starts_at)
), boundary_points AS (
    SELECT sqlc.arg(starts_at)::timestamptz AS moment
    UNION
    SELECT starts_at
    FROM relevant_campaigns
    WHERE starts_at > sqlc.arg(starts_at)
      AND starts_at < sqlc.arg(ends_at)
)
SELECT COALESCE(MAX(
    (
        SELECT COUNT(*)
        FROM relevant_campaigns campaign
        WHERE campaign.starts_at <= point.moment
          AND campaign.ends_at > point.moment
    )
), 0)::bigint
FROM boundary_points point;

-- name: CreatePromotionCampaign :one
INSERT INTO promotion_campaigns (
    event_id,
    organizer_id,
    plan,
    placement,
    starts_at,
    ends_at,
    amount_bani
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id;

-- name: CancelPendingPromotionCampaign :exec
UPDATE promotion_campaigns
SET status = 'cancelled'
WHERE id = $1
  AND status = 'pending_payment';

-- name: SavePromotionCheckoutSession :exec
UPDATE promotion_campaigns
SET stripe_checkout_session_id = $2
WHERE id = $1;

-- name: ListExpiredPromotionCheckoutReservations :many
SELECT id, stripe_checkout_session_id
FROM promotion_campaigns
WHERE status = 'pending_payment'
  AND stripe_checkout_session_id IS NOT NULL
  AND created_at <= sqlc.arg(expires_before)
ORDER BY created_at
LIMIT 50;

-- name: CancelAbandonedPromotionReservations :exec
UPDATE promotion_campaigns
SET status = 'cancelled'
WHERE status = 'pending_payment'
  AND stripe_checkout_session_id IS NULL
  AND created_at <= sqlc.arg(expires_before);

-- name: FulfillPromotionCampaign :execrows
UPDATE promotion_campaigns
SET status = CASE
        WHEN starts_at <= CURRENT_TIMESTAMP THEN 'active'::promotion_status
        ELSE 'scheduled'::promotion_status
    END,
    stripe_payment_intent_id = NULLIF(sqlc.arg(payment_intent_id)::text, ''),
    paid_at = CURRENT_TIMESTAMP
WHERE id = $1
  AND status = 'pending_payment'
  AND stripe_checkout_session_id = $2;

-- name: GetPromotionCampaignStatusForCheckout :one
SELECT status
FROM promotion_campaigns
WHERE id = $1
  AND stripe_checkout_session_id = $2;

-- name: ListPromotionCampaigns :many
SELECT
    campaign.id,
    campaign.event_id,
    event.title AS event_title,
    campaign.plan,
    campaign.placement,
    campaign.status,
    campaign.starts_at,
    campaign.ends_at,
    campaign.amount_bani,
    campaign.impressions_count,
    campaign.clicks_count,
    campaign.created_at
FROM promotion_campaigns campaign
JOIN events event ON event.id = campaign.event_id
WHERE campaign.organizer_id = $1
ORDER BY campaign.created_at DESC;

-- name: ListActivePromotionCampaignEvents :many
WITH ranked_campaigns AS (
    SELECT
        campaign.id AS campaign_id,
        campaign.event_id,
        campaign.placement,
        ROW_NUMBER() OVER (
            PARTITION BY campaign.placement
            ORDER BY RANDOM()
        ) AS placement_rank
    FROM promotion_campaigns campaign
    JOIN events event ON event.id = campaign.event_id
    WHERE campaign.status = 'active'
      AND campaign.starts_at <= CURRENT_TIMESTAMP
      AND campaign.ends_at > CURRENT_TIMESTAMP
      AND event.status = 'published'
      AND event.end_time > CURRENT_TIMESTAMP
      AND NOT EXISTS (
          SELECT 1
          FROM user_hidden_event_categories hidden
          WHERE hidden.user_id = sqlc.arg(user_id)
            AND hidden.category = UPPER(event.category)
      )
)
SELECT campaign_id, event_id, placement
FROM ranked_campaigns
WHERE placement = 'home_banner' OR placement_rank <= 10
ORDER BY RANDOM();

-- name: RecordPromotionImpression :exec
WITH inserted_metric AS (
    INSERT INTO promotion_metric_events (
        campaign_id,
        user_id,
        viewer_key,
        metric
    )
    SELECT campaign.id, sqlc.arg(user_id), sqlc.arg(viewer_key), 'impression'
    FROM promotion_campaigns campaign
    WHERE campaign.id = sqlc.arg(campaign_id)
      AND campaign.status = 'active'
      AND campaign.starts_at <= CURRENT_TIMESTAMP
      AND campaign.ends_at > CURRENT_TIMESTAMP
    ON CONFLICT (campaign_id, viewer_key, metric) DO NOTHING
    RETURNING campaign_id
)
UPDATE promotion_campaigns campaign
SET impressions_count = impressions_count + 1
WHERE campaign.id = sqlc.arg(campaign_id)
  AND EXISTS (SELECT 1 FROM inserted_metric);

-- name: RecordPromotionClick :exec
WITH inserted_metric AS (
    INSERT INTO promotion_metric_events (
        campaign_id,
        user_id,
        viewer_key,
        metric
    )
    SELECT campaign.id, sqlc.arg(user_id), sqlc.arg(viewer_key), 'click'
    FROM promotion_campaigns campaign
    WHERE campaign.id = sqlc.arg(campaign_id)
      AND campaign.status = 'active'
      AND campaign.starts_at <= CURRENT_TIMESTAMP
      AND campaign.ends_at > CURRENT_TIMESTAMP
    ON CONFLICT (campaign_id, viewer_key, metric) DO NOTHING
    RETURNING campaign_id
)
UPDATE promotion_campaigns campaign
SET clicks_count = clicks_count + 1
WHERE campaign.id = sqlc.arg(campaign_id)
  AND EXISTS (SELECT 1 FROM inserted_metric);
