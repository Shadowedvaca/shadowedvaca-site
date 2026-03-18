-- Phase F.1: Hub feedback ingest table
-- Run once against the Hub's PostgreSQL database.
-- No PII is stored here — contact info stays in the client app.

CREATE TABLE IF NOT EXISTS shadowedvaca.customer_feedback (
    id                    SERIAL PRIMARY KEY,
    program_name          VARCHAR(80)  NOT NULL,
    received_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- De-identified context; no contact_info column ever
    is_authenticated_user BOOLEAN      NOT NULL DEFAULT FALSE,
    is_anonymous          BOOLEAN      NOT NULL DEFAULT FALSE,
    privacy_token         VARCHAR(64),

    -- Raw inputs
    score                 INTEGER      CHECK (score BETWEEN 1 AND 10),
    raw_feedback          TEXT         NOT NULL,

    -- AI-enriched fields (NULL until processed)
    summary               TEXT,
    sentiment             VARCHAR(20),
    tags                  JSONB,
    processed_at          TIMESTAMPTZ,
    processing_error      TEXT
);

CREATE INDEX IF NOT EXISTS idx_cf_program
    ON shadowedvaca.customer_feedback (program_name);
CREATE INDEX IF NOT EXISTS idx_cf_received
    ON shadowedvaca.customer_feedback (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_cf_sentiment
    ON shadowedvaca.customer_feedback (sentiment);
CREATE INDEX IF NOT EXISTS idx_cf_tags
    ON shadowedvaca.customer_feedback USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_cf_token
    ON shadowedvaca.customer_feedback (privacy_token)
    WHERE privacy_token IS NOT NULL;

-- Grant permissions to the application user
GRANT SELECT, INSERT, UPDATE, DELETE ON shadowedvaca.customer_feedback TO sv_site_user;
GRANT USAGE, SELECT ON SEQUENCE shadowedvaca.customer_feedback_id_seq TO sv_site_user;
