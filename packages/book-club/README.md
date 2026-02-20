# Book Club App

A lightweight web app for a small book club. Members propose books, vote on what to read, schedule discussions, and vote on availability.

## Stack

- **Frontend:** React 18 + Vite + Tailwind CSS + React Router v6
- **Backend:** Node.js + Express REST API (raw SQL with `pg`)
- **Database:** PostgreSQL
- **Auth:** JWT + bcrypt

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL running locally

### 1. Create the database

```bash
createdb bookclub
```

### 2. Configure environment variables

```bash
# Server
cp server/.env.example server/.env
# Edit server/.env — set DATABASE_URL and JWT_SECRET

# Client (optional, defaults to http://localhost:3001/api)
cp client/.env.example client/.env
```

### 3. Install dependencies

```bash
npm run install:all
```

### 4. Start dev servers

```bash
npm run dev
```

This starts:
- Express API on `http://localhost:3001`
- Vite dev server on `http://localhost:5173`

The database schema is auto-migrated on server start. The initial invite code `FOUNDER2026` is seeded automatically.

## First-time Setup

1. Go to `http://localhost:5173`
2. Click "Join the Club"
3. Register with invite code `FOUNDER2026`
4. You are now the admin
5. Go to Admin Panel → generate invite codes for other members

## API Overview

All endpoints are prefixed with `/api`. See `book-club-build-spec.md` for full documentation.

### Auth
- `POST /api/auth/register` — register with invite code
- `POST /api/auth/login` — login
- `GET /api/auth/me` — current user
- `PATCH /api/auth/me` — update profile

### Rounds
- `GET /api/rounds` — list all rounds
- `POST /api/rounds` — create round (admin)
- `GET /api/rounds/:id` — round detail with proposals
- `POST /api/rounds/:id/close` — close and tally (admin)

### Votes
- `POST /api/rounds/:id/votes` — submit votes (UPSERT)
- `GET /api/rounds/:id/votes/mine` — my votes
- `GET /api/rounds/:id/results` — results

### Export
- `GET /api/export/full` — full JSON dump (admin)
- `GET /api/export/since?ts=<ISO8601>` — delta export (admin)

## Voting Methods

**Approval:** Each member approves any number of books. Highest approvals wins.

**Ranked Choice:** Members rank up to 3 books. 1st = 3 pts, 2nd = 2 pts, 3rd = 1 pt. Highest total wins.

Ties broken by: most 1st-place votes (ranked choice) or earliest proposal submission.
