-- +goose Up
UPDATE events
SET banner_url = REPLACE(
    banner_url,
    'https://pulse-api.code-lab.ro',
    'https://api.spottr.ro'
)
WHERE banner_url LIKE 'https://pulse-api.code-lab.ro/api/v1/media/%';

UPDATE users
SET avatar_url = REPLACE(
    avatar_url,
    'https://pulse-api.code-lab.ro',
    'https://api.spottr.ro'
)
WHERE avatar_url LIKE 'https://pulse-api.code-lab.ro/api/v1/media/%';

UPDATE event_updates
SET image_url = REPLACE(
    image_url,
    'https://pulse-api.code-lab.ro',
    'https://api.spottr.ro'
)
WHERE image_url LIKE 'https://pulse-api.code-lab.ro/api/v1/media/%';

UPDATE event_artists
SET image_url = REPLACE(
    image_url,
    'https://pulse-api.code-lab.ro',
    'https://api.spottr.ro'
)
WHERE image_url LIKE 'https://pulse-api.code-lab.ro/api/v1/media/%';

-- This is an idempotent data migration. Reverting all current-domain URLs would
-- also rewrite media uploaded after the migration, so rollback is intentionally
-- a no-op.
-- +goose Down
SELECT 1;
