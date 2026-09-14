\set db_password ''
\getenv db_password DB_PASSWORD

SELECT (length(:'db_password') >= 16) AS db_password_is_valid \gset
\if :db_password_is_valid
\else
    \echo 'DB_PASSWORD must be configured with at least 16 characters.'
    \quit
\endif

SELECT format('CREATE ROLE pulse_user WITH LOGIN PASSWORD %L', :'db_password')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'pulse_user') \gexec

ALTER ROLE pulse_user WITH LOGIN PASSWORD :'db_password';

SELECT 'CREATE DATABASE pulse_db OWNER pulse_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'pulse_db')\gexec

GRANT ALL PRIVILEGES ON DATABASE pulse_db TO pulse_user;
