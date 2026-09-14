-- name: CreatePendingEventBannerAsset :one
INSERT INTO event_banner_assets (owner_id, s3_key)
VALUES ($1, $2)
RETURNING *;

-- name: RemoveStaleEventBannerReferences :execrows
WITH stale AS MATERIALIZED (
    SELECT reference.event_id, reference.asset_id
    FROM event_banner_references reference
    JOIN events event ON event.id = reference.event_id
    JOIN event_banner_assets asset ON asset.id = reference.asset_id
    WHERE event.organizer_id IS DISTINCT FROM asset.owner_id
       OR substring(
            spottr_percent_decode_ascii(split_part(split_part(event.banner_url, '#', 1), '?', 1))
            FROM '/api/v1/media/(events/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32}\.(jpg|png|webp))$'
          ) IS DISTINCT FROM asset.s3_key
    ORDER BY reference.event_id
    FOR UPDATE OF event, reference SKIP LOCKED
)
DELETE FROM event_banner_references reference
USING stale
WHERE reference.event_id = stale.event_id
  AND reference.asset_id = stale.asset_id;

-- name: ReconcileLegacyEventBannerReferences :exec
WITH candidates AS MATERIALIZED (
    SELECT e.id AS event_id,
           e.organizer_id AS owner_id,
           substring(
               spottr_percent_decode_ascii(split_part(split_part(e.banner_url, '#', 1), '?', 1))
               FROM '/api/v1/media/(events/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32}\.(jpg|png|webp))$'
           ) AS s3_key
    FROM events e
    WHERE e.organizer_id IS NOT NULL AND e.banner_url IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM event_banner_references reference
          JOIN event_banner_assets current_asset ON current_asset.id = reference.asset_id
          WHERE reference.event_id = e.id
            AND current_asset.owner_id = e.organizer_id
            AND current_asset.status = 'ready'
            AND current_asset.delete_after IS NULL
            AND current_asset.s3_key = substring(
                spottr_percent_decode_ascii(split_part(split_part(e.banner_url, '#', 1), '?', 1))
                FROM '/api/v1/media/(events/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32}\.(jpg|png|webp))$'
            )
      )
    FOR UPDATE OF e SKIP LOCKED
), owned AS MATERIALIZED (
    SELECT event_id, owner_id, s3_key
    FROM candidates
    WHERE s3_key IS NOT NULL
      AND split_part(s3_key, '/', 2) = lower(owner_id::text)
), inserted_assets AS (
    INSERT INTO event_banner_assets (owner_id, s3_key, status)
    SELECT DISTINCT owner_id, s3_key, 'ready'
    FROM owned
    ON CONFLICT (s3_key) DO NOTHING
    RETURNING id, owner_id, s3_key
), existing_assets AS MATERIALIZED (
    SELECT asset.id, asset.owner_id, asset.s3_key
    FROM event_banner_assets asset
    JOIN (SELECT DISTINCT owner_id, s3_key FROM owned) candidate
      ON candidate.owner_id = asset.owner_id AND candidate.s3_key = asset.s3_key
    WHERE asset.status = 'ready'
    ORDER BY asset.id
    FOR UPDATE OF asset SKIP LOCKED
), activated_existing_assets AS (
    UPDATE event_banner_assets asset
    SET delete_after = NULL,
        updated_at = clock_timestamp(),
        last_error = NULL
    FROM existing_assets existing
    WHERE asset.id = existing.id AND asset.status = 'ready'
    RETURNING asset.id, asset.owner_id, asset.s3_key
), available_assets AS (
    SELECT id, owner_id, s3_key FROM activated_existing_assets
    UNION ALL
    SELECT id, owner_id, s3_key FROM inserted_assets
)
INSERT INTO event_banner_references (event_id, asset_id)
SELECT owned.event_id, asset.id
FROM owned
JOIN available_assets asset
  ON asset.owner_id = owned.owner_id AND asset.s3_key = owned.s3_key
ON CONFLICT (event_id) DO UPDATE
SET asset_id = EXCLUDED.asset_id, updated_at = clock_timestamp();

-- name: ScheduleAllUnreferencedEventBannerAssets :execrows
WITH candidates AS MATERIALIZED (
    SELECT asset.id
    FROM event_banner_assets asset
    WHERE asset.status = 'ready'
      AND asset.delete_after IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM event_banner_references reference WHERE reference.asset_id = asset.id
      )
      AND NOT EXISTS (
          SELECT 1 FROM events event
          WHERE right(
              spottr_percent_decode_ascii(split_part(split_part(event.banner_url, '#', 1), '?', 1)),
              length('/api/v1/media/' || asset.s3_key)
          ) = '/api/v1/media/' || asset.s3_key
      )
    ORDER BY asset.id
    FOR UPDATE OF asset SKIP LOCKED
)
UPDATE event_banner_assets asset
SET delete_after = clock_timestamp() + INTERVAL '72 hours',
    updated_at = clock_timestamp()
FROM candidates
WHERE asset.id = candidates.id;

-- name: MarkEventBannerAssetReady :execrows
UPDATE event_banner_assets
SET status = 'ready',
    delete_after = $2,
    updated_at = clock_timestamp(),
    last_error = NULL
WHERE id = $1 AND owner_id = $3 AND status = 'pending_upload';

-- name: FindReadyEventBannerAsset :one
SELECT id
FROM event_banner_assets
WHERE owner_id = $1 AND s3_key = $2 AND status = 'ready';

-- name: GetEventBannerReference :one
SELECT asset_id
FROM event_banner_references
WHERE event_id = $1;

-- name: LockEventBannerAssetPair :many
SELECT id
FROM event_banner_assets
WHERE id = $1 OR id = $2
ORDER BY id
FOR UPDATE;

-- name: ActivateReadyEventBannerAsset :execrows
UPDATE event_banner_assets
SET delete_after = NULL,
    updated_at = clock_timestamp(),
    last_error = NULL
WHERE id = $1 AND owner_id = $2 AND s3_key = $3 AND status = 'ready';

-- name: UpsertEventBannerReference :exec
INSERT INTO event_banner_references (event_id, asset_id)
VALUES ($1, $2)
ON CONFLICT (event_id) DO UPDATE
SET asset_id = EXCLUDED.asset_id, updated_at = clock_timestamp();

-- name: DeleteEventBannerReference :exec
DELETE FROM event_banner_references WHERE event_id = $1;

-- name: ScheduleEventBannerAssetDeletionIfUnreferenced :execrows
UPDATE event_banner_assets asset
SET delete_after = COALESCE(asset.delete_after, $2),
    updated_at = clock_timestamp()
WHERE asset.id = $1
  AND asset.status = 'ready'
  AND NOT EXISTS (
      SELECT 1 FROM event_banner_references reference WHERE reference.asset_id = asset.id
  )
  AND NOT EXISTS (
      SELECT 1 FROM events event
      WHERE right(
          spottr_percent_decode_ascii(split_part(split_part(event.banner_url, '#', 1), '?', 1)),
          length('/api/v1/media/' || asset.s3_key)
      ) = '/api/v1/media/' || asset.s3_key
  );

-- name: ClaimDueEventBannerAssetDeletion :one
WITH candidate AS (
    SELECT asset.id
    FROM event_banner_assets asset
    WHERE (
        (asset.status = 'ready' AND asset.delete_after <= clock_timestamp())
        OR (asset.status = 'pending_upload' AND asset.created_at <= clock_timestamp() - INTERVAL '24 hours')
        OR (asset.status = 'deleting' AND asset.deletion_lease_expires_at <= clock_timestamp())
    )
      AND NOT EXISTS (
          SELECT 1 FROM event_banner_references reference WHERE reference.asset_id = asset.id
      )
      AND NOT EXISTS (
          SELECT 1 FROM events event
          WHERE right(
              spottr_percent_decode_ascii(split_part(split_part(event.banner_url, '#', 1), '?', 1)),
              length('/api/v1/media/' || asset.s3_key)
          ) = '/api/v1/media/' || asset.s3_key
      )
    ORDER BY COALESCE(asset.delete_after, asset.created_at), asset.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
UPDATE event_banner_assets asset
SET status = 'deleting',
    deletion_lease_id = gen_random_uuid(),
    deletion_lease_expires_at = clock_timestamp() + INTERVAL '5 minutes',
    delete_attempts = asset.delete_attempts + 1,
    updated_at = clock_timestamp()
FROM candidate
WHERE asset.id = candidate.id
RETURNING asset.id, asset.s3_key, asset.deletion_lease_id;

-- name: CompleteEventBannerAssetDeletion :execrows
DELETE FROM event_banner_assets asset
WHERE asset.id = $1
  AND asset.status = 'deleting'
  AND asset.deletion_lease_id = $2
  AND NOT EXISTS (
      SELECT 1 FROM event_banner_references reference WHERE reference.asset_id = asset.id
  )
  AND NOT EXISTS (
      SELECT 1 FROM events event
      WHERE right(
          spottr_percent_decode_ascii(split_part(split_part(event.banner_url, '#', 1), '?', 1)),
          length('/api/v1/media/' || asset.s3_key)
      ) = '/api/v1/media/' || asset.s3_key
  );

-- name: RecordEventBannerAssetDeletionFailure :execrows
UPDATE event_banner_assets
SET last_error = $3,
    deletion_lease_expires_at = $4,
    updated_at = clock_timestamp()
WHERE id = $1 AND status = 'deleting' AND deletion_lease_id = $2;
