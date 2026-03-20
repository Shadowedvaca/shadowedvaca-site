# Phase 1 — Database Migration

## Context

This is phase 1 of 6 for the ideation board per-user access control feature. Read `reference/ideation-assignment-plan.md` for the full picture.

This phase only creates a new table. Nothing else changes. No code is deployed.

---

## What to Build

Create `scripts/migrations/add_idea_access_overrides.sql` and run it on the server.

---

## The Migration File

**File:** `scripts/migrations/add_idea_access_overrides.sql`

Model it exactly on `scripts/migrations/add_idea_reactions.sql` — same header comment style, `IF NOT EXISTS` guards, index creation, GRANT at the end.

```sql
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
```

### Design notes

- `idea_id` has no FK — ideas live in sv-tools (a separate service). This is the same pattern used by `idea_votes` and `idea_favorites`.
- `user_id` has `ON DELETE CASCADE` — if a user is deleted via the admin panel, their overrides are automatically removed.
- No DEFAULT on `can_view` — a row's presence always means an explicit, intentional decision was made by the admin.
- `updated_at` is included for audit purposes. It must be manually set in upsert queries (see Phase 3) because `pg_insert().on_conflict_do_update()` bypasses the ORM's `onupdate` hook.
- Both indexes are on columns that will be queried frequently: the proxy filters by `user_id`, and the admin panel queries by `idea_id`.

---

## Steps

1. Write the file at `scripts/migrations/add_idea_access_overrides.sql`.

2. SSH to the server and run it:
   ```bash
   ssh -i ~/.ssh/va_hetzner_openssh deploy@5.78.114.224
   psql "postgresql://sv_site_user:SvSiteDb2026@127.0.0.1:5432/sv_site_db" \
     -f /opt/shadowedvaca/scripts/migrations/add_idea_access_overrides.sql
   ```
   Note: the migration file won't be on the server yet since it hasn't been committed. Either scp it first or copy-paste the SQL directly into psql.

3. Verify the table was created:
   ```sql
   \d shadowedvaca.idea_access_overrides
   ```
   Expected: 5 columns (idea_id, user_id, can_view, created_at, updated_at), primary key on (idea_id, user_id), two indexes.

4. Commit the migration file:
   ```bash
   git add scripts/migrations/add_idea_access_overrides.sql
   git commit -m "feat(ideas): add idea_access_overrides migration"
   git push
   ```

---

## Done When

- `scripts/migrations/add_idea_access_overrides.sql` exists in the repo and is committed
- The table exists on the server (verified with `\d`)
- No application code has been changed
