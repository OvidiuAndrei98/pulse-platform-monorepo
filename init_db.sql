
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'pulse_user') THEN
        CREATE ROLE pulse_user WITH LOGIN PASSWORD 'Codelab1233q!';
    END IF;
END
$$;

-- 2. Creăm baza de date dacă nu există deja și o asociem utilizatorului
SELECT 'CREATE DATABASE pulse_db OWNER pulse_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'pulse_db')\gexec

-- 3. Oferim toate privilegiile utilizatorului pe această bază de date
GRANT ALL PRIVILEGES ON DATABASE pulse_db TO pulse_user;