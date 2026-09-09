-- +goose Up

INSERT INTO users (username, email, password_hash, role, is_active)
VALUES (
    'spottr_admin',
    'hello@spottr.ro',
    '$2a$10$IdM9iSbGQlN3ae75l5kd4e9bh0PMVL/xB3xeVvSfeUje9yy2PZK9u',
    'admin',
    TRUE
)
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    role = 'admin',
    is_active = TRUE;

-- +goose Down

-- This is an operational account. A rollback must not delete it because the
-- email may have existed before this migration and could own application data.
SELECT 1;
