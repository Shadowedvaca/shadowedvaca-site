-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

------------------------------------------------------------
-- USERS
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  contact_channel VARCHAR(20) DEFAULT 'email',
  contact_address TEXT,
  notification_prefs JSONB DEFAULT '{"vote_reminders": true, "meeting_confirmations": true, "new_proposals": true}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'users_updated_at') THEN
    CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

------------------------------------------------------------
-- INVITE CODES
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id),
  used_by UUID REFERENCES users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

------------------------------------------------------------
-- ROUNDS
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  voting_method VARCHAR(20) NOT NULL DEFAULT 'approval',
  deadline TIMESTAMPTZ,
  winning_proposal_id UUID,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'rounds_updated_at') THEN
    CREATE TRIGGER rounds_updated_at BEFORE UPDATE ON rounds
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

------------------------------------------------------------
-- PROPOSALS
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  proposed_by UUID NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  author VARCHAR(255),
  description TEXT,
  cover_url TEXT,
  vote_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'proposals_updated_at') THEN
    CREATE TRIGGER proposals_updated_at BEFORE UPDATE ON proposals
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

------------------------------------------------------------
-- VOTES
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(round_id, user_id, proposal_id)
);

------------------------------------------------------------
-- MEETINGS
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  proposed_by UUID NOT NULL REFERENCES users(id),
  proposed_datetime TIMESTAMPTZ NOT NULL,
  location TEXT,
  virtual_link TEXT,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'proposed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'meetings_updated_at') THEN
    CREATE TRIGGER meetings_updated_at BEFORE UPDATE ON meetings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

------------------------------------------------------------
-- AVAILABILITY
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  response VARCHAR(10) NOT NULL DEFAULT 'no',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(meeting_id, user_id)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'availability_updated_at') THEN
    CREATE TRIGGER availability_updated_at BEFORE UPDATE ON availability
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

------------------------------------------------------------
-- NOTIFICATIONS
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  channel VARCHAR(20) NOT NULL,
  subject VARCHAR(255),
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'logged',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

------------------------------------------------------------
-- Foreign key for winning_proposal_id
------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_winning_proposal'
  ) THEN
    ALTER TABLE rounds
      ADD CONSTRAINT fk_winning_proposal
      FOREIGN KEY (winning_proposal_id) REFERENCES proposals(id);
  END IF;
END $$;
