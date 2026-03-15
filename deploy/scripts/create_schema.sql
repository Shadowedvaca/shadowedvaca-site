-- First-run schema creation for sv_site
-- Run as a Postgres superuser or the patt_user with CREATE SCHEMA privilege:
--   psql -U patt_user -d patt_db -f create_schema.sql

CREATE SCHEMA IF NOT EXISTS shadowedvaca;

CREATE TABLE IF NOT EXISTS shadowedvaca.users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shadowedvaca.invite_codes (
    code                VARCHAR(16) PRIMARY KEY,
    created_by_user_id  INTEGER REFERENCES shadowedvaca.users(id) ON DELETE SET NULL,
    used_at             TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    permissions         JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS shadowedvaca.user_permissions (
    user_id   INTEGER NOT NULL REFERENCES shadowedvaca.users(id) ON DELETE CASCADE,
    tool_slug VARCHAR(64) NOT NULL,
    PRIMARY KEY (user_id, tool_slug)
);

-- To create the first admin user, generate a bcrypt hash and insert directly:
--   python3 -c "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt()).decode())"
--
-- INSERT INTO shadowedvaca.users (username, password_hash, is_admin)
-- VALUES ('mike', '<bcrypt-hash-here>', TRUE);
