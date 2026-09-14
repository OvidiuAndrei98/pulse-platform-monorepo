-- +goose Up

-- The original password-based administrator bootstrap was removed. Migrations
-- must never create or overwrite privileged credentials. Existing databases
-- have already recorded this version and are intentionally left unchanged;
-- fresh environments provision administrators through the operational runbook.
SELECT 1;

-- +goose Down

SELECT 1;
