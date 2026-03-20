-- Phase F-V.1: Ideation board votes and favorites
-- Run once against the Hub's PostgreSQL database.
-- psql -U sv_site_user -d sv_db -f scripts/migrations/add_idea_reactions.sql

CREATE TABLE IF NOT EXISTS shadowedvaca.idea_votes (
    user_id     INTEGER     NOT NULL
                            REFERENCES shadowedvaca.users(id) ON DELETE CASCADE,
    idea_id     INTEGER     NOT NULL,
    vote        SMALLINT    NOT NULL CHECK (vote IN (-1, 1)),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, idea_id)
);

CREATE INDEX IF NOT EXISTS idx_iv_idea_id
    ON shadowedvaca.idea_votes (idea_id);

CREATE TABLE IF NOT EXISTS shadowedvaca.idea_favorites (
    user_id     INTEGER     NOT NULL
                            REFERENCES shadowedvaca.users(id) ON DELETE CASCADE,
    idea_id     INTEGER     NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, idea_id)
);

CREATE INDEX IF NOT EXISTS idx_if_idea_id
    ON shadowedvaca.idea_favorites (idea_id);

-- Grant permissions to the application user
GRANT SELECT, INSERT, UPDATE, DELETE ON shadowedvaca.idea_votes     TO sv_site_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON shadowedvaca.idea_favorites TO sv_site_user;
