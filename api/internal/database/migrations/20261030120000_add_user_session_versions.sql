-- +goose Up
-- Keep backfill and trigger installation atomic with respect to account writes.
LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE user_session_versions (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0)
);

INSERT INTO user_session_versions (user_id) SELECT id FROM users;

-- +goose StatementBegin
CREATE FUNCTION maintain_user_session_version() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO user_session_versions (user_id) VALUES (NEW.id);
    ELSIF OLD.password_hash IS DISTINCT FROM NEW.password_hash
       OR OLD.role IS DISTINCT FROM NEW.role
       OR OLD.is_active IS DISTINCT FROM NEW.is_active
       OR OLD.google_id IS DISTINCT FROM NEW.google_id THEN
        INSERT INTO user_session_versions (user_id, version) VALUES (NEW.id, 2)
        ON CONFLICT (user_id) DO UPDATE
            SET version = user_session_versions.version + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE TRIGGER users_session_version
AFTER INSERT OR UPDATE OF password_hash, role, is_active, google_id ON users
FOR EACH ROW EXECUTE FUNCTION maintain_user_session_version();

-- +goose Down
DROP TRIGGER users_session_version ON users;
DROP FUNCTION maintain_user_session_version();
DROP TABLE user_session_versions;
