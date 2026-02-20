# Claude Code Prompt — Book Club App

Drop this file and `book-club-build-spec.md` into an empty project directory. Open Claude Code in that directory and paste the prompt below.

---

## Prompt

```
Read the file `book-club-build-spec.md` in this directory. It is the complete build specification for a book club web application.

Build this as a full-stack application with the following structure:

**Frontend:** React 18 + Vite + Tailwind CSS. React Router v6 for navigation. Clean, warm, bookish design — think independent bookstore vibes with cream backgrounds, serif headings, and book-card style proposal components. Mobile-responsive.

**Backend:** Node.js + Express REST API. Use the `pg` driver directly with parameterized queries — no ORM. JWT auth with bcrypt password hashing. Input validation on all endpoints.

**Database:** PostgreSQL. Run the full schema from the spec as a migration on startup. Seed the initial invite code `FOUNDER2026`.

Build the complete application in one pass:

1. Database schema + migration runner + seed data
2. All REST API endpoints from the spec (auth, invites, rounds, proposals, votes, meetings, availability, notifications log, export)
3. Vote scoring logic for both ranked choice and approval methods
4. Auth middleware (JWT verification, admin-only guard)
5. React frontend with all pages: Login/Register, Dashboard, Round Detail (with voting UI for both methods), Past Rounds, Profile, Admin Panel
6. API client layer in the frontend
7. Working dev setup: single `npm run dev` starts both client (Vite) and server (Express) concurrently

The spec has the exact SQL schema, every API endpoint with request/response details, the scoring algorithm, page descriptions, UI design direction, project structure, and environment variables.

Key implementation details:
- UUIDs for all primary keys (pgcrypto extension)
- `updated_at` auto-trigger on all tables that have it
- Votes use UPSERT — submitting new votes replaces previous ones for that user+round
- `proposals.vote_score` is a cached column, recomputed when votes are submitted or round is closed
- Notifications are logged to the database only — no actual dispatch
- The export endpoints return nested JSON (rounds → proposals → votes, etc.)
- First user to register becomes admin automatically

After building, verify that the end-to-end flow described in the "What to Verify" section of the spec works. Fix any issues before finishing.

The spec is authoritative. Follow it closely. If anything is ambiguous, make a reasonable choice and leave a comment noting the decision.
```
