-- +goose Up

ALTER TABLE orders
    ADD COLUMN account_owner_deleted_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE user_media_deletion_jobs (
    object_key TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX user_media_deletion_jobs_due_idx
    ON user_media_deletion_jobs (next_attempt_at);

-- +goose Down

DROP TABLE IF EXISTS user_media_deletion_jobs;

ALTER TABLE orders
    DROP COLUMN IF EXISTS account_owner_deleted_at;
