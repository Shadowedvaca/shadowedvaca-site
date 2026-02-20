# Book Club App — Build Specification

## Overview

A lightweight web app for a small book club. Members propose books, vote on what to read, schedule discussion meetups, and vote on availability. API-driven backend designed for easy data export to an external context database.

---

## Resolved Design Decisions

These were open questions in the original plan. Locked in for this build:

- **Single club.** No multi-club support. One instance = one club. Simplifies everything.
- **Email/password auth only.** No OAuth. Self-contained, no external dependencies.
- **Both voting methods supported.** Each round specifies `ranked_choice` or `approval` at creation time. Ranked choice: members rank their top 3, weighted scoring (3 pts for 1st, 2 pts for 2nd, 1 pt for 3rd). Approval: thumbs up/down per proposal, most approvals wins.
- **Polling, no WebSockets.** Small group, no need for real-time. Frontend polls on relevant pages.
- **Skip notifications for now.** The notification table and endpoints exist in the schema, but no actual dispatch (no SendGrid, no Twilio). Just log notifications to the database. Dispatch adapters are a future add.
- **Skip book cover lookup.** No Open Library API integration. Users can paste a cover URL manually if they want. Cover lookup is a future polish item.
- **Include export endpoints.** These are cheap to build and important for context DB integration.
- **Admin role = the first registered user.** First person to register with a valid invite code gets admin role. Admin can generate new invite codes and manage rounds.

---

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Frontend | React 18 + Vite + Tailwind CSS | SPA with React Router v6 |
| Backend | Node.js + Express | REST API, JSON responses |
| Database | PostgreSQL | Use `pg` driver directly, no ORM. Raw SQL with parameterized queries. |
| Auth | JWT (jsonwebtoken) + bcrypt | Access tokens in memory, refresh tokens in httpOnly cookies |
| Validation | express-validator or zod | Validate all inputs server-side |

### Project Structure

```
book-club/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Route-level page components
│   │   ├── hooks/          # Custom hooks (useAuth, useFetch, etc.)
│   │   ├── context/        # React context (AuthContext)
│   │   ├── lib/            # API client, helpers
│   │   └── App.jsx
│   ├── index.html
│   └── vite.config.js
├── server/                 # Express backend
│   ├── src/
│   │   ├── routes/         # Route handlers grouped by domain
│   │   ├── middleware/      # Auth middleware, error handler, validation
│   │   ├── db/             # Database connection, migration runner
│   │   │   └── migrations/ # Numbered SQL migration files
│   │   ├── lib/            # Helpers (scoring, invite codes, etc.)
│   │   └── index.js        # Express app setup
│   └── package.json
├── package.json            # Root workspace (scripts to run both)
└── README.md
```

---

## Database Schema (PostgreSQL)

All tables use UUID primary keys. All tables include `created_at` and `updated_at` timestamps (auto-set via defaults and triggers).

```sql
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
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member',  -- 'admin' or 'member'
  contact_channel VARCHAR(20) DEFAULT 'email', -- 'email', 'sms', 'discord', 'slack'
  contact_address TEXT,                         -- phone number, webhook URL, etc.
  notification_prefs JSONB DEFAULT '{"vote_reminders": true, "meeting_confirmations": true, "new_proposals": true}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

------------------------------------------------------------
-- INVITE CODES
------------------------------------------------------------
CREATE TABLE invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id),         -- NULL for the seed invite
  used_by UUID REFERENCES users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

------------------------------------------------------------
-- ROUNDS (voting rounds for book selection)
------------------------------------------------------------
CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,                   -- e.g. "March 2026 Pick"
  status VARCHAR(20) NOT NULL DEFAULT 'open',    -- 'open', 'closed', 'archived'
  voting_method VARCHAR(20) NOT NULL DEFAULT 'approval', -- 'ranked_choice' or 'approval'
  deadline TIMESTAMPTZ,
  winning_proposal_id UUID,                      -- set when round closes
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER rounds_updated_at BEFORE UPDATE ON rounds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

------------------------------------------------------------
-- PROPOSALS (books proposed within a round)
------------------------------------------------------------
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  proposed_by UUID NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  author VARCHAR(255),
  description TEXT,
  cover_url TEXT,
  vote_score INTEGER DEFAULT 0,                  -- cached tally, recomputed on vote
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER proposals_updated_at BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

------------------------------------------------------------
-- VOTES
------------------------------------------------------------
-- For ranked_choice: rank = 1, 2, or 3 (1st, 2nd, 3rd choice)
-- For approval: rank = 1 means approved, no row means not approved
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(round_id, user_id, proposal_id)         -- one vote per user per proposal per round
);

------------------------------------------------------------
-- MEETINGS (proposed meeting times for a round)
------------------------------------------------------------
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  proposed_by UUID NOT NULL REFERENCES users(id),
  proposed_datetime TIMESTAMPTZ NOT NULL,
  location TEXT,
  virtual_link TEXT,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'proposed', -- 'proposed' or 'confirmed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER meetings_updated_at BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

------------------------------------------------------------
-- AVAILABILITY (member responses to proposed meetings)
------------------------------------------------------------
CREATE TABLE availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  response VARCHAR(10) NOT NULL DEFAULT 'no',    -- 'yes', 'maybe', 'no'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(meeting_id, user_id)                    -- one response per user per meeting option
);
CREATE TRIGGER availability_updated_at BEFORE UPDATE ON availability
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

------------------------------------------------------------
-- NOTIFICATIONS (log only — no dispatch in MVP)
------------------------------------------------------------
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  channel VARCHAR(20) NOT NULL,
  subject VARCHAR(255),
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'logged',  -- 'logged', 'sent', 'failed'
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

------------------------------------------------------------
-- Add foreign key for winning_proposal_id after proposals table exists
------------------------------------------------------------
ALTER TABLE rounds
  ADD CONSTRAINT fk_winning_proposal
  FOREIGN KEY (winning_proposal_id) REFERENCES proposals(id);
```

---

## API Endpoints

All endpoints return JSON. Authenticated endpoints require `Authorization: Bearer <token>` header.

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Create account. Body: `{ email, password, display_name, invite_code }`. Validates invite code hasn't been used. First user gets admin role. Returns JWT. |
| POST | `/api/auth/login` | No | Login. Body: `{ email, password }`. Returns JWT + user object. |
| GET | `/api/auth/me` | Yes | Returns current user profile. |
| PATCH | `/api/auth/me` | Yes | Update profile. Body: any of `{ display_name, contact_channel, contact_address, notification_prefs }`. |

### Invite Codes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/invites` | Admin | Generate a new invite code. Returns `{ code }`. |
| GET | `/api/invites` | Admin | List all invite codes with usage status. |

### Rounds

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/rounds` | Yes | List all rounds. Includes status, proposal count, winning book if closed. Ordered by created_at desc. |
| POST | `/api/rounds` | Admin | Create a new round. Body: `{ title, voting_method, deadline }`. |
| GET | `/api/rounds/:id` | Yes | Round details including all proposals with vote scores. |
| PATCH | `/api/rounds/:id` | Admin | Update round (edit title, deadline, change status). |
| POST | `/api/rounds/:id/close` | Admin | Close the round. Tallies votes, sets winning_proposal_id, updates status to 'closed'. |

### Proposals

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/rounds/:id/proposals` | Yes | Propose a book. Body: `{ title, author, description, cover_url }`. Only allowed if round is open. |
| DELETE | `/api/proposals/:id` | Yes | Delete own proposal (or admin can delete any). Only if round is open. |

### Votes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/rounds/:id/votes` | Yes | Submit votes. Body format depends on voting method. **Ranked choice:** `{ votes: [{ proposal_id, rank }] }` (up to 3). **Approval:** `{ votes: [{ proposal_id }] }` (any number). Replaces any existing votes by this user in this round. |
| GET | `/api/rounds/:id/votes/mine` | Yes | Get current user's votes for this round. |
| GET | `/api/rounds/:id/results` | Yes | Tallied results. Returns proposals sorted by score with vote breakdown. |

### Meetings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/rounds/:id/meetings` | Yes | List proposed meeting times for this round with availability counts. |
| POST | `/api/rounds/:id/meetings` | Yes | Propose a meeting time. Body: `{ proposed_datetime, location, virtual_link, notes }`. |
| POST | `/api/meetings/:id/availability` | Yes | Submit availability. Body: `{ response }` where response is 'yes', 'maybe', or 'no'. Upserts. |
| PATCH | `/api/meetings/:id/confirm` | Admin | Confirm this meeting time. Sets status to 'confirmed', logs notification for all members. |
| DELETE | `/api/meetings/:id` | Yes | Delete own proposed meeting (or admin). Only if not confirmed. |

### Notifications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications` | Yes | Current user's notification log. Paginated. |
| POST | `/api/notifications/send` | Admin | Send ad-hoc message to all members. Body: `{ subject, body }`. Logs a notification per member. |

### Data Export

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/export/full` | Admin | Full JSON dump of all tables. Nested structure: rounds → proposals → votes, meetings → availability. |
| GET | `/api/export/since?ts=<ISO8601>` | Admin | Delta export. Returns only records with `created_at` or `updated_at` after the given timestamp. |

---

## Vote Scoring Logic

### Ranked Choice
Each round, members rank up to 3 proposals. Scoring:
- Rank 1 = 3 points
- Rank 2 = 2 points
- Rank 3 = 1 point

When closing a round, sum scores per proposal. Highest score wins. Ties broken by: most 1st-place votes, then most 2nd-place, then earliest proposal (created_at).

### Approval
Each round, members vote thumbs-up on any number of proposals. Each approval = 1 point. Highest count wins. Ties broken by earliest proposal.

### Score Caching
The `proposals.vote_score` column is a cached value. Recompute it:
- When any vote is submitted (recalc all proposals in the round)
- When the round is closed (final tally)

---

## Frontend Pages

### 1. Login / Register
- Tab or toggle between login and register forms
- Register requires invite code field
- On success, store JWT and redirect to dashboard

### 2. Dashboard (Home)
- Current open round (if any) with its proposals and a vote button
- Most recently closed round with the winning book highlighted
- Upcoming confirmed meeting (if any) with details
- Quick action buttons: "Propose a Book", "View Past Rounds"

### 3. Round Detail
- Round title, status badge, deadline countdown (if open)
- List of proposals: title, author, description, proposer name, current score
- Voting interface (changes based on voting method):
  - **Ranked choice:** Drag-to-rank or numbered dropdown for top 3
  - **Approval:** Checkbox per proposal
- Results section (visible after round closes): ranked list with scores and winner badge
- Meeting section: list of proposed times with availability buttons (yes/maybe/no) and attendee counts

### 4. Past Rounds Archive
- List of all closed/archived rounds with winning book, date, and vote count

### 5. Profile
- Edit display name, contact channel, contact address, notification preferences

### 6. Admin Panel
- Generate invite codes (show code + copy button)
- Create new round (title, voting method, deadline picker)
- Close round (with confirmation)
- Confirm meeting times
- Send ad-hoc notifications
- View all members

---

## UI Design Direction

Clean, warm, bookish. Not corporate, not gaming-dark. Think independent bookstore vibes.

- **Color palette:** Warm cream/off-white backgrounds, deep navy or charcoal text, a muted accent color (terracotta, sage green, or warm gold) for interactive elements
- **Typography:** A readable serif for headings (Georgia, Merriweather, or Lora), clean sans-serif for body text
- **Cards:** Proposals displayed as book-card style components with subtle shadows
- **Minimal chrome:** No heavy borders, no complex navigation. Tab bar or simple sidebar. The app should feel like 3-4 screens, not 20.
- **Mobile-first:** Members will mostly interact on their phones. Voting and availability responses should work great on small screens.

---

## Seed Data

On first run (when database is empty), auto-create one invite code so the first user can register:

```sql
INSERT INTO invite_codes (code) VALUES ('FOUNDER2026');
```

This code is used by the first person to register, who becomes admin. After that, the admin generates new codes for friends.

---

## Environment Variables

```
# Server
PORT=3001
DATABASE_URL=postgresql://user:pass@localhost:5432/bookclub
JWT_SECRET=<random-string-at-least-32-chars>
JWT_EXPIRES_IN=7d
NODE_ENV=development

# Client (Vite)
VITE_API_URL=http://localhost:3001/api
```

---

## What NOT to Build (Explicitly Out of Scope)

- No OAuth / social login
- No real notification dispatch (just database logging)
- No Open Library / Google Books API integration
- No WebSocket / real-time updates
- No reading progress tracking
- No threaded discussion / comments
- No multi-club support
- No file uploads (cover_url is a text field, paste a URL)
- No password reset flow (manual reset via admin is fine for MVP)

---

## What to Verify Works Before Sleeping

After Claude Code finishes building, the following flow should work end-to-end:

1. Start the dev server (both client and API)
2. Register with the seed invite code `FOUNDER2026` → become admin
3. Generate a new invite code from admin panel
4. Register a second user with that code
5. Create a voting round (approval method)
6. Both users propose books
7. Both users vote
8. Admin closes the round → winner is calculated
9. A user proposes a meeting time
10. Both users submit availability
11. Admin confirms the meeting
12. Hit `/api/export/full` and see coherent JSON

If that flow works, the app is in good shape.
