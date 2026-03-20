# Phase F-V.1 — DB Migration + SQLAlchemy Models

**Branch:** `ideation-voting` (off `main`)
**Prereq:** Read `reference/ideation-voting-plan.md` for full context.

## Goal
Create two new tables in the `shadowedvaca` schema for idea votes and favorites,
and add the corresponding SQLAlchemy ORM models.

---

## Step 1 — Create the migration file

Create `scripts/migrations/add_idea_reactions.sql`:

```sql
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
```

**Notes:**
- `idea_id` is a plain integer — it references the idea ID from sv-tools.
  No FK to sv-tools; that service owns those IDs.
- PK on `(user_id, idea_id)` enforces one vote / one favorite per user per idea.
- `ON DELETE CASCADE` — if a user is deleted, their votes/favorites go with them.

---

## Step 2 — Run the migration on the server

```bash
ssh deploy@5.78.114.224
psql -U sv_site_user -d sv_db -f /path/to/add_idea_reactions.sql
```

Or from local (copy + run):
```bash
scp -i ~/.ssh/va_hetzner_openssh \
    scripts/migrations/add_idea_reactions.sql \
    deploy@5.78.114.224:/tmp/add_idea_reactions.sql

ssh -i ~/.ssh/va_hetzner_openssh deploy@5.78.114.224 \
    "psql \$DATABASE_URL -f /tmp/add_idea_reactions.sql"
```

Verify:
```sql
\dt shadowedvaca.idea_*
-- should list idea_votes and idea_favorites
```

---

## Step 3 — Add SQLAlchemy models

File: `src/sv_site/models.py`

Add these two classes **after** the existing `CustomerFeedback` class (end of file):

```python
# ---------------------------------------------------------------------------
# shadowedvaca.idea_votes
# ---------------------------------------------------------------------------


class IdeaVote(Base):
    __tablename__ = "idea_votes"
    __table_args__ = (
        CheckConstraint("vote IN (-1, 1)", name="ck_iv_vote"),
        {"schema": "shadowedvaca"},
    )

    user_id:    Mapped[int]      = mapped_column(
        Integer, ForeignKey("shadowedvaca.users.id", ondelete="CASCADE"), primary_key=True
    )
    idea_id:    Mapped[int]      = mapped_column(Integer, primary_key=True)
    vote:       Mapped[int]      = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship()


# ---------------------------------------------------------------------------
# shadowedvaca.idea_favorites
# ---------------------------------------------------------------------------


class IdeaFavorite(Base):
    __tablename__ = "idea_favorites"
    __table_args__ = {"schema": "shadowedvaca"}

    user_id:    Mapped[int]      = mapped_column(
        Integer, ForeignKey("shadowedvaca.users.id", ondelete="CASCADE"), primary_key=True
    )
    idea_id:    Mapped[int]      = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship()
```

The existing imports in `models.py` already cover everything needed:
`Boolean, CheckConstraint, ForeignKey, Integer, String, Text` from `sqlalchemy`,
`TIMESTAMP` from `sqlalchemy.dialects.postgresql`,
`Mapped, mapped_column, relationship` from `sqlalchemy.orm`,
`func` from `sqlalchemy.sql`, and `datetime` from `datetime`.

---

## Step 4 — Smoke test

No app restart needed yet (models are loaded at import time, tested in phase 2).

Quick sanity check — confirm the file parses cleanly:

```bash
cd H:/Development/shadowedvaca-site
python -c "from sv_site.models import IdeaVote, IdeaFavorite; print('OK')"
```

Expected output: `OK`

---

## Done
Phase 1 complete when:
- [ ] `scripts/migrations/add_idea_reactions.sql` exists
- [ ] Migration has been run on the server (both tables visible in `\dt`)
- [ ] `IdeaVote` and `IdeaFavorite` classes added to `src/sv_site/models.py`
- [ ] `python -c "from sv_site.models import IdeaVote, IdeaFavorite; print('OK')"` passes

Proceed to `reference/ideation-voting-phase2-api.md`.
