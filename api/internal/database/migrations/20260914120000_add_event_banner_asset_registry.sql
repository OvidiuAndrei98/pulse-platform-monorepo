-- +goose Up

-- Decode ASCII percent escapes used in URL paths. Banner keys are ASCII-only,
-- so this deliberately avoids applying URL form semantics (such as '+' -> space).
-- +goose StatementBegin
CREATE FUNCTION spottr_percent_decode_ascii(input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
    output TEXT := '';
    position INTEGER := 1;
    hex_pair TEXT;
    decoded_byte INTEGER;
BEGIN
    WHILE position <= length(input) LOOP
        IF substring(input FROM position FOR 1) = '%' AND position + 2 <= length(input) THEN
            hex_pair := substring(input FROM position + 1 FOR 2);
            IF hex_pair ~ '^[0-9A-Fa-f]{2}$' THEN
                decoded_byte := get_byte(decode(hex_pair, 'hex'), 0);
                -- PostgreSQL text cannot contain NUL. Non-ASCII escapes are
                -- irrelevant to ASCII banner keys, so preserve them verbatim.
                IF decoded_byte BETWEEN 1 AND 127 THEN
                    output := output || chr(decoded_byte);
                ELSE
                    output := output || '%' || hex_pair;
                END IF;
                position := position + 3;
                CONTINUE;
            END IF;
        END IF;
        output := output || substring(input FROM position FOR 1);
        position := position + 1;
    END LOOP;
    RETURN output;
END;
$$;
-- +goose StatementEnd

CREATE TABLE event_banner_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    s3_key TEXT NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending_upload'
        CHECK (status IN ('pending_upload', 'ready', 'deleting')),
    delete_after TIMESTAMPTZ,
    deletion_lease_id UUID,
    deletion_lease_expires_at TIMESTAMPTZ,
    delete_attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT event_banner_deletion_lease_check CHECK (
        (status = 'deleting' AND deletion_lease_id IS NOT NULL AND deletion_lease_expires_at IS NOT NULL)
        OR
        (status <> 'deleting' AND deletion_lease_id IS NULL AND deletion_lease_expires_at IS NULL)
    )
);

CREATE TABLE event_banner_references (
    event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES event_banner_assets(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX event_banner_references_asset_idx ON event_banner_references(asset_id);
CREATE INDEX event_banner_assets_gc_idx
    ON event_banner_assets(status, delete_after, deletion_lease_expires_at, created_at);

-- Backfill only canonical URLs whose owner directory exactly matches the event owner.
WITH candidates AS (
    SELECT e.id AS event_id,
           e.organizer_id AS owner_id,
           substring(spottr_percent_decode_ascii(split_part(split_part(e.banner_url, '#', 1), '?', 1)) FROM '/api/v1/media/(events/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32}\.(jpg|png|webp))$') AS s3_key
    FROM events e
    WHERE e.organizer_id IS NOT NULL AND e.banner_url IS NOT NULL
), owned AS (
    SELECT DISTINCT owner_id, s3_key
    FROM candidates
    WHERE s3_key IS NOT NULL
      AND split_part(s3_key, '/', 2) = lower(owner_id::text)
)
INSERT INTO event_banner_assets (owner_id, s3_key, status)
SELECT owner_id, s3_key, 'ready'
FROM owned
ON CONFLICT (s3_key) DO NOTHING;

WITH candidates AS (
    SELECT e.id AS event_id,
           e.organizer_id AS owner_id,
           substring(spottr_percent_decode_ascii(split_part(split_part(e.banner_url, '#', 1), '?', 1)) FROM '/api/v1/media/(events/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32}\.(jpg|png|webp))$') AS s3_key
    FROM events e
    WHERE e.organizer_id IS NOT NULL AND e.banner_url IS NOT NULL
), owned AS (
    SELECT event_id, owner_id, s3_key
    FROM candidates
    WHERE s3_key IS NOT NULL
      AND split_part(s3_key, '/', 2) = lower(owner_id::text)
)
INSERT INTO event_banner_references (event_id, asset_id)
SELECT owned.event_id, asset.id
FROM owned
JOIN event_banner_assets asset
  ON asset.owner_id = owned.owner_id AND asset.s3_key = owned.s3_key
ON CONFLICT (event_id) DO NOTHING;

-- +goose Down

DROP TABLE IF EXISTS event_banner_references;
DROP TABLE IF EXISTS event_banner_assets;
DROP FUNCTION IF EXISTS spottr_percent_decode_ascii(TEXT);
