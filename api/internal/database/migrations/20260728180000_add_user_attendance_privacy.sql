-- +goose Up
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS show_attendance_publicly BOOLEAN NOT NULL DEFAULT TRUE;

-- +goose Down
ALTER TABLE users
    DROP COLUMN IF EXISTS show_attendance_publicly;
