-- +goose Up
-- Intentionally no user ID, IP, arbitrary message, URL, request body or headers.
CREATE TABLE client_error_reports (
    id UUID PRIMARY KEY,
    fingerprint CHAR(64) NOT NULL,
    platform VARCHAR(8) NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    app_version VARCHAR(40) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    report JSONB NOT NULL CHECK (octet_length(report::text) <= 12288)
);
CREATE INDEX client_error_reports_recent_idx ON client_error_reports(received_at DESC, id DESC);
CREATE INDEX client_error_reports_platform_recent_idx ON client_error_reports(platform, received_at DESC, id DESC);

-- +goose Down
DROP TABLE IF EXISTS client_error_reports;
