-- +goose Up

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS user_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE, 
    type VARCHAR(20) NOT NULL CHECK (type IN ('activation', 'password_reset')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_tokens_hash ON user_tokens(token_hash);

-- +goose Down
DROP TABLE IF EXISTS user_tokens;
ALTER TABLE users DROP COLUMN IF EXISTS is_active;
ALTER TABLE users DROP COLUMN IF EXISTS google_id;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;