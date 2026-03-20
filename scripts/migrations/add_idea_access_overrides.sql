-- Idea access overrides
-- Per-user visibility overrides for ideas, independent of sv-tools public/secret status.
-- Run: psql "postgresql://sv_site_user:SvSiteDb2026@127.0.0.1:5432/sv_site_db" -f scripts/migrations/add_idea_access_overrides.sql

CREATE TABLE IF NOT EXISTS shadowedvaca.idea_access_overrides (
    idea_id     INTEGER     NOT NULL,
    user_id     INTEGER     NOT NULL
                                REFERENCES shadowedvaca.users(id) ON DELETE CASCADE,
    can_view    BOOLEAN     NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (idea_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_iao_idea_id
    ON shadowedvaca.idea_access_overrides (idea_id);

CREATE INDEX IF NOT EXISTS idx_iao_user_id
    ON shadowedvaca.idea_access_overrides (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE
    ON shadowedvaca.idea_access_overrides TO sv_site_user;
