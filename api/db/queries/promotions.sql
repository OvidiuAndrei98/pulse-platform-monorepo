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

-- name: LockPromotionPaymentIntent :exec
SELECT pg_advisory_xact_lock(hashtextextended('promotion-payment:' || sqlc.arg(payment_intent_id)::text, 0));

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
    amount_bani,
    billing_email,
    billing_type,
    billing_name,
    billing_tax_id,
    billing_registration_number,
    billing_address,
    billing_city,
    billing_county,
    billing_sector,
    billing_country,
    invoice_provider,
    invoice_issuer_account_email,
    invoice_issuer_company_vat_code,
    invoice_issuer_series_name,
    invoice_vat_name,
    invoice_vat_percentage,
    invoice_send_email,
    invoice_send_to_spv,
    invoice_payment_type
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25, $26)
RETURNING id;

-- name: CancelPendingPromotionCampaign :exec
UPDATE promotion_campaigns
SET status = 'cancelled'
WHERE id = $1
  AND status = 'pending_payment';

-- name: CancelPendingPromotionCampaignForCheckout :exec
UPDATE promotion_campaigns
SET status = 'cancelled'
WHERE id = sqlc.arg(id)
  AND status = 'pending_payment'
  AND stripe_checkout_session_id = sqlc.arg(stripe_checkout_session_id)::TEXT;

-- name: SavePromotionCheckoutSession :exec
UPDATE promotion_campaigns
SET stripe_checkout_session_id = sqlc.arg(stripe_checkout_session_id),
    stripe_livemode = sqlc.arg(stripe_livemode)
WHERE id = $1;

-- name: ListExpiredPromotionCheckoutReservations :many
SELECT id, stripe_checkout_session_id
FROM promotion_campaigns
WHERE status = 'pending_payment'
  AND stripe_checkout_session_id IS NOT NULL
  AND promotion_campaigns.created_at <= sqlc.arg(expires_before)
ORDER BY created_at
LIMIT 50;

-- name: CancelAbandonedPromotionReservations :exec
-- A missing local session can mean Stripe created one but the HTTP request or
-- database write failed. Never release this capacity automatically: quarantine
-- it for reconciliation instead.
INSERT INTO promotion_checkout_reviews (campaign_id, reason, status)
SELECT campaign.id, 'stale_sessionless_checkout', 'needs_review'
FROM promotion_campaigns campaign
WHERE campaign.status = 'pending_payment'
  AND campaign.stripe_checkout_session_id IS NULL
  AND campaign.created_at <= sqlc.arg(expires_before)
ON CONFLICT (campaign_id) DO UPDATE SET
    reason = promotion_checkout_reviews.reason,
    status = 'needs_review',
    updated_at = CURRENT_TIMESTAMP;

-- name: FulfillPromotionCampaign :one
WITH fulfilled AS (
    UPDATE promotion_campaigns
    SET status = CASE
            WHEN starts_at <= CURRENT_TIMESTAMP THEN 'active'::promotion_status
            ELSE 'scheduled'::promotion_status
        END,
        stripe_payment_intent_id = NULLIF(sqlc.arg(payment_intent_id)::text, ''),
        paid_at = CURRENT_TIMESTAMP
    WHERE promotion_campaigns.id = sqlc.arg(id)
      AND promotion_campaigns.status = 'pending_payment'
      AND promotion_campaigns.stripe_checkout_session_id = sqlc.arg(stripe_checkout_session_id)::TEXT
      AND promotion_campaigns.stripe_livemode = sqlc.arg(stripe_livemode)::BOOLEAN
      AND (promotion_campaigns.stripe_livemode IS FALSE OR NULLIF(sqlc.arg(payment_intent_id)::text, '') IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM promotion_refund_states refund
        WHERE refund.payment_intent_id = sqlc.arg(payment_intent_id)::TEXT
          AND refund.status IN ('pending', 'partial', 'full')
      )
      AND (
        promotion_campaigns.stripe_livemode IS FALSE
        OR (
          promotion_campaigns.invoice_provider IN ('oblio', 'smartbill')
          AND promotion_campaigns.invoice_issuer_account_email <> ''
          AND promotion_campaigns.invoice_issuer_company_vat_code <> ''
          AND promotion_campaigns.invoice_issuer_series_name <> ''
        )
      )
    RETURNING *
), queued_invoice AS (
INSERT INTO promotion_invoices (
    campaign_id, organizer_id, event_id, payment_intent_id, stripe_livemode,
    provider, issuer_account_email, issuer_company_vat_code, issuer_series_name,
    vat_name, vat_percentage, send_email, send_to_spv, payment_type,
    customer_email, billing_type, billing_name, billing_tax_id,
    billing_registration_number, billing_address, billing_city, billing_county,
    billing_sector, billing_country, event_title, plan, placement, starts_at,
    ends_at, amount_bani
)
SELECT campaign.id, campaign.organizer_id, campaign.event_id,
       campaign.stripe_payment_intent_id, campaign.stripe_livemode,
       campaign.invoice_provider, campaign.invoice_issuer_account_email,
       campaign.invoice_issuer_company_vat_code, campaign.invoice_issuer_series_name,
       campaign.invoice_vat_name, campaign.invoice_vat_percentage,
       campaign.invoice_send_email, campaign.invoice_send_to_spv,
       campaign.invoice_payment_type, campaign.billing_email,
       campaign.billing_type, campaign.billing_name, campaign.billing_tax_id,
       campaign.billing_registration_number, campaign.billing_address,
       campaign.billing_city, campaign.billing_county, campaign.billing_sector,
       campaign.billing_country, event.title, campaign.plan, campaign.placement,
       campaign.starts_at, campaign.ends_at, campaign.amount_bani
FROM fulfilled campaign
JOIN events event ON event.id = campaign.event_id
WHERE campaign.stripe_livemode IS TRUE
  AND campaign.stripe_payment_intent_id IS NOT NULL
ON CONFLICT (campaign_id) DO NOTHING
RETURNING id
)
SELECT EXISTS (SELECT 1 FROM fulfilled) AS fulfilled;

-- name: FlagPromotionCheckoutReview :exec
INSERT INTO promotion_checkout_reviews (
    campaign_id, reason, stripe_checkout_session_id, stripe_payment_intent_id, stripe_livemode
) VALUES (
    sqlc.arg(campaign_id), sqlc.arg(reason), NULLIF(sqlc.arg(stripe_checkout_session_id)::TEXT, ''),
    NULLIF(sqlc.arg(stripe_payment_intent_id)::TEXT, ''), sqlc.narg(stripe_livemode)::BOOLEAN
)
ON CONFLICT (campaign_id) DO UPDATE SET
    reason = EXCLUDED.reason,
    stripe_checkout_session_id = COALESCE(EXCLUDED.stripe_checkout_session_id, promotion_checkout_reviews.stripe_checkout_session_id),
    stripe_payment_intent_id = COALESCE(EXCLUDED.stripe_payment_intent_id, promotion_checkout_reviews.stripe_payment_intent_id),
    stripe_livemode = COALESCE(EXCLUDED.stripe_livemode, promotion_checkout_reviews.stripe_livemode),
    status = 'needs_review',
    updated_at = CURRENT_TIMESTAMP;

-- name: FulfillLegacyPromotionCampaignForReview :execrows
WITH legacy AS (
    UPDATE promotion_campaigns
    SET status = CASE WHEN starts_at <= CURRENT_TIMESTAMP THEN 'active'::promotion_status ELSE 'scheduled'::promotion_status END,
        stripe_payment_intent_id = NULLIF(sqlc.arg(payment_intent_id)::TEXT, ''),
        stripe_livemode = sqlc.arg(stripe_livemode)::BOOLEAN,
        paid_at = CURRENT_TIMESTAMP
    WHERE promotion_campaigns.id = sqlc.arg(id)
      AND promotion_campaigns.status = 'pending_payment'
      AND promotion_campaigns.stripe_checkout_session_id = sqlc.arg(stripe_checkout_session_id)::TEXT
      AND promotion_campaigns.stripe_livemode IS NULL
      AND NULLIF(sqlc.arg(payment_intent_id)::TEXT, '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM promotion_refund_states refund
        WHERE refund.payment_intent_id = sqlc.arg(payment_intent_id)::TEXT
          AND refund.status IN ('pending', 'partial', 'full')
      )
    RETURNING id
)
INSERT INTO promotion_checkout_reviews (
    campaign_id, reason, stripe_checkout_session_id, stripe_payment_intent_id, stripe_livemode
)
SELECT id, 'legacy_paid_missing_fiscal_snapshot', sqlc.arg(stripe_checkout_session_id),
       sqlc.arg(payment_intent_id), sqlc.arg(stripe_livemode)
FROM legacy
ON CONFLICT (campaign_id) DO UPDATE SET
    reason = EXCLUDED.reason,
    stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
    stripe_livemode = EXCLUDED.stripe_livemode,
    status = 'needs_review', updated_at = CURRENT_TIMESTAMP;

-- name: RecordPromotionRefundState :one
WITH resolved AS (
    SELECT candidate.id
    FROM (
        SELECT campaign.id
        FROM promotion_campaigns campaign
        WHERE (campaign.stripe_livemode IS NULL OR campaign.stripe_livemode = sqlc.arg(stripe_livemode)::BOOLEAN)
          AND (
            campaign.stripe_payment_intent_id = sqlc.arg(payment_intent_id)::TEXT
            OR (
              campaign.id = sqlc.narg(campaign_id)::UUID
              AND (campaign.stripe_payment_intent_id IS NULL OR campaign.stripe_payment_intent_id = sqlc.arg(payment_intent_id)::TEXT)
            )
          )
        UNION
        SELECT invoice.campaign_id
        FROM promotion_invoices invoice
        WHERE invoice.payment_intent_id = sqlc.arg(payment_intent_id)::TEXT
          AND invoice.stripe_livemode = sqlc.arg(stripe_livemode)::BOOLEAN
    ) candidate
    LIMIT 1
), stored AS (
    INSERT INTO promotion_refund_states (
        payment_intent_id, campaign_id, stripe_refund_id, stripe_charge_id,
        stripe_livemode, refunded_amount_bani, charge_amount_bani, status
    )
    SELECT sqlc.arg(payment_intent_id), resolved.id,
           NULLIF(sqlc.arg(stripe_refund_id)::TEXT, ''), NULLIF(sqlc.arg(stripe_charge_id)::TEXT, ''),
           sqlc.arg(stripe_livemode), sqlc.arg(refunded_amount_bani), sqlc.arg(charge_amount_bani), sqlc.arg(refund_status)
    FROM resolved
    ON CONFLICT (payment_intent_id) DO UPDATE SET
        campaign_id = COALESCE(EXCLUDED.campaign_id, promotion_refund_states.campaign_id),
        stripe_refund_id = COALESCE(EXCLUDED.stripe_refund_id, promotion_refund_states.stripe_refund_id),
        stripe_charge_id = COALESCE(EXCLUDED.stripe_charge_id, promotion_refund_states.stripe_charge_id),
        refunded_amount_bani = GREATEST(promotion_refund_states.refunded_amount_bani, EXCLUDED.refunded_amount_bani),
        charge_amount_bani = GREATEST(promotion_refund_states.charge_amount_bani, EXCLUDED.charge_amount_bani),
        status = CASE
          WHEN promotion_refund_states.status = 'full' OR EXCLUDED.status = 'full' THEN 'full'
          WHEN promotion_refund_states.status = 'partial' OR EXCLUDED.status = 'partial' THEN 'partial'
          WHEN EXCLUDED.status = 'failed' THEN 'failed'
          ELSE 'pending'
        END,
        updated_at = CURRENT_TIMESTAMP
    RETURNING campaign_id, refunded_amount_bani, charge_amount_bani, status
), updated_campaign AS (
    UPDATE promotion_campaigns campaign
    SET stripe_payment_intent_id = COALESCE(campaign.stripe_payment_intent_id, sqlc.arg(payment_intent_id)::TEXT),
        status = CASE WHEN stored.status IN ('partial', 'full') THEN 'cancelled'::promotion_status ELSE campaign.status END
    FROM stored
    WHERE campaign.id = stored.campaign_id
    RETURNING campaign.id
), updated_invoice AS (
    UPDATE promotion_invoices invoice
    SET refunded_amount_bani = GREATEST(invoice.refunded_amount_bani, stored.refunded_amount_bani),
        refund_status = CASE
          WHEN invoice.status IN ('issued', 'dispatching') AND stored.status IN ('partial', 'full') THEN 'needs_review'
          ELSE stored.status
        END,
        status = CASE
          WHEN invoice.status IN ('pending', 'processing', 'failed') AND stored.status IN ('pending', 'partial', 'full') THEN 'needs_review'
          ELSE invoice.status
        END,
        claim_token = CASE
          WHEN invoice.status IN ('pending', 'processing', 'failed') AND stored.status IN ('pending', 'partial', 'full') THEN NULL
          ELSE invoice.claim_token
        END,
        error_message = CASE
          WHEN stored.status IN ('pending', 'partial', 'full') THEN 'Refund Stripe detectat; documentul fiscal necesita reconciliere manuala.'
          ELSE invoice.error_message
        END,
        updated_at = CURRENT_TIMESTAMP
    FROM stored
    WHERE invoice.payment_intent_id = sqlc.arg(payment_intent_id)::TEXT
    RETURNING invoice.id
)
SELECT EXISTS (SELECT 1 FROM resolved) AS handled;

-- name: PromotionRefundStateExists :one
SELECT EXISTS (
    SELECT 1 FROM promotion_refund_states
    WHERE payment_intent_id = $1
      AND status IN ('pending', 'partial', 'full')
);

-- name: CancelPromotionCampaignForKnownRefund :execrows
UPDATE promotion_campaigns
SET status = 'cancelled',
    stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, sqlc.arg(payment_intent_id)::TEXT),
    stripe_livemode = COALESCE(stripe_livemode, sqlc.arg(stripe_livemode)::BOOLEAN),
    paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)
WHERE id = sqlc.arg(id)
  AND status = 'pending_payment'
  AND stripe_checkout_session_id = sqlc.arg(stripe_checkout_session_id)::TEXT
  AND EXISTS (
      SELECT 1 FROM promotion_refund_states refund
      WHERE refund.payment_intent_id = sqlc.arg(payment_intent_id)::TEXT
        AND refund.status IN ('pending', 'partial', 'full')
  );

-- name: GetPromotionCampaignStatusForCheckout :one
SELECT status
FROM promotion_campaigns
WHERE id = $1
  AND stripe_checkout_session_id = $2;

-- name: PromotionInvoiceExists :one
SELECT EXISTS (
    SELECT 1 FROM promotion_invoices WHERE campaign_id = $1
);

-- name: PromotionFiscalReviewExists :one
SELECT EXISTS (
    SELECT 1 FROM promotion_checkout_reviews
    WHERE campaign_id = $1
      AND status = 'needs_review'
      AND reason = 'legacy_paid_missing_fiscal_snapshot'
);

-- name: ClaimPromotionInvoices :many
WITH claimable AS (
    SELECT id
    FROM promotion_invoices
    WHERE attempt_count < 8
      AND (
        (status IN ('pending', 'failed') AND next_attempt_at <= CURRENT_TIMESTAMP)
        OR (status = 'processing' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes')
      )
    ORDER BY next_attempt_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT sqlc.arg(batch_size)
)
UPDATE promotion_invoices invoice
SET status = 'processing',
    claim_token = gen_random_uuid(),
    attempt_count = attempt_count + 1,
    error_message = NULL,
    updated_at = CURRENT_TIMESTAMP
FROM claimable
WHERE invoice.id = claimable.id
RETURNING invoice.*;

-- name: MarkStalePromotionInvoiceDispatchesForReview :execrows
UPDATE promotion_invoices
SET status = 'needs_review',
    claim_token = NULL,
    error_message = COALESCE(error_message, 'Rezultatul emiterii este necunoscut; verifica furnizorul inainte de orice reluare.'),
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'dispatching'
  AND updated_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes';

-- name: GetPromotionInvoiceIssueData :one
SELECT * FROM promotion_invoices WHERE id = $1;

-- name: BeginPromotionInvoiceDispatch :execrows
UPDATE promotion_invoices
SET status = 'dispatching', updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id)
  AND claim_token = sqlc.arg(claim_token)
  AND status = 'processing'
  AND NOT EXISTS (
      SELECT 1 FROM promotion_refund_states refund
      WHERE refund.payment_intent_id = promotion_invoices.payment_intent_id
        AND refund.status IN ('pending', 'partial', 'full')
  );

-- name: MarkPromotionInvoiceIssued :execrows
UPDATE promotion_invoices
SET status = 'issued', claim_token = NULL,
    external_series = sqlc.arg(external_series),
    external_number = sqlc.arg(external_number),
    external_document_id = sqlc.arg(external_document_id),
    document_url = sqlc.arg(document_url),
    error_message = NULL, issued_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id)
  AND claim_token = sqlc.arg(claim_token)
  AND status = 'dispatching';

-- name: MarkPromotionInvoiceFailed :execrows
UPDATE promotion_invoices
SET status = CASE WHEN sqlc.arg(needs_review)::BOOLEAN THEN 'needs_review' ELSE 'failed' END,
    claim_token = NULL,
    error_message = sqlc.arg(error_message),
    next_attempt_at = CURRENT_TIMESTAMP + make_interval(secs => sqlc.arg(retry_seconds)::INT),
    updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id)
  AND claim_token = sqlc.arg(claim_token)
  AND status IN ('processing', 'dispatching');

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
    campaign.created_at,
    invoice.status AS invoice_status,
    invoice.external_series AS invoice_series,
    invoice.external_number AS invoice_number,
    invoice.document_url AS invoice_document_url,
    invoice.issued_at AS invoice_issued_at,
    invoice.refund_status AS invoice_refund_status,
    COALESCE(invoice.refunded_amount_bani, 0)::INT AS invoice_refunded_amount_bani,
    COALESCE(invoice.status = 'needs_review'
      OR invoice.refund_status = 'needs_review'
      OR review.status = 'needs_review', FALSE)::BOOLEAN AS attention_required,
    COALESCE(CASE
      WHEN invoice.refund_status = 'needs_review' THEN 'promotion_invoice_refund_requires_reconciliation'
      WHEN invoice.status = 'needs_review' THEN 'promotion_invoice_issue_requires_reconciliation'
      WHEN review.status = 'needs_review' THEN review.reason
      ELSE NULL
    END, '')::TEXT AS attention_reason
FROM promotion_campaigns campaign
JOIN events event ON event.id = campaign.event_id
LEFT JOIN promotion_invoices invoice ON invoice.campaign_id = campaign.id
LEFT JOIN promotion_checkout_reviews review ON review.campaign_id = campaign.id
WHERE campaign.organizer_id = $1
ORDER BY campaign.created_at DESC;

-- name: ListAdminPromotionInvoiceAttention :many
SELECT
    invoice.id AS attention_id,
    invoice.campaign_id,
    invoice.event_title,
    invoice.organizer_id,
    invoice.customer_email,
    invoice.amount_bani,
    invoice.payment_intent_id,
    invoice.status AS invoice_status,
    invoice.refund_status,
    invoice.refunded_amount_bani,
    (CASE
      WHEN invoice.refund_status = 'needs_review' THEN 'promotion_invoice_refund_requires_reconciliation'
      ELSE COALESCE(invoice.error_message, 'promotion_invoice_issue_requires_reconciliation')
    END)::TEXT AS reason,
    invoice.created_at,
    invoice.updated_at
FROM promotion_invoices invoice
WHERE invoice.status = 'needs_review'
   OR invoice.refund_status = 'needs_review'
UNION ALL
SELECT
    review.id AS attention_id,
    campaign.id AS campaign_id,
    event.title AS event_title,
    campaign.organizer_id,
    app_user.email AS customer_email,
    campaign.amount_bani,
    COALESCE(review.stripe_payment_intent_id, campaign.stripe_payment_intent_id, '')::TEXT AS payment_intent_id,
    ''::TEXT AS invoice_status,
    ''::TEXT AS refund_status,
    0::INT AS refunded_amount_bani,
    review.reason::TEXT AS reason,
    review.created_at,
    review.updated_at
FROM promotion_checkout_reviews review
JOIN promotion_campaigns campaign ON campaign.id = review.campaign_id
JOIN events event ON event.id = campaign.event_id
JOIN users app_user ON app_user.id = campaign.organizer_id
WHERE review.status = 'needs_review'
  AND NOT EXISTS (
      SELECT 1 FROM promotion_invoices invoice
      WHERE invoice.campaign_id = campaign.id
        AND (invoice.status = 'needs_review' OR invoice.refund_status = 'needs_review')
  )
ORDER BY updated_at DESC;

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
