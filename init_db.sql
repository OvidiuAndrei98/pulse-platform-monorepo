DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'pulse_user') THEN
        CREATE ROLE pulse_user WITH LOGIN PASSWORD 'Codelab1233q!';
    END IF;
END
$$;

ALTER ROLE pulse_user WITH LOGIN;

SELECT 'CREATE DATABASE pulse_db OWNER pulse_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'pulse_db')\gexec

GRANT ALL PRIVILEGES ON DATABASE pulse_db TO pulse_user;
