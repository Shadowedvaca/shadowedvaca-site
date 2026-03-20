# Phase 2 — ORM Model

## Context

This is phase 2 of 6 for the ideation board per-user access control feature. Read `reference/ideation-assignment-plan.md` for the full picture.

**Prereq:** Phase 1 complete (the `shadowedvaca.idea_access_overrides` table exists on the server).

This phase adds the SQLAlchemy model class. No endpoints change, no behavior changes. The model is just wired up so Phase 3 can import it.

---

## What to Build

Add `IdeaAccessOverride` to `src/sv_site/models.py`.

---

## The Model

Open `src/sv_site/models.py`. Read the `IdeaVote` and `IdeaFavorite` classes (currently the last two models in the file, around lines 119–155). The new model follows their exact structure.

Add this at the end of the file:

```python
# ---------------------------------------------------------------------------
# shadowedvaca.idea_access_overrides
# ---------------------------------------------------------------------------


class IdeaAccessOverride(Base):
    __tablename__ = "idea_access_overrides"
    __table_args__ = {"schema": "shadowedvaca"}

    idea_id:    Mapped[int]      = mapped_column(Integer, primary_key=True)
    user_id:    Mapped[int]      = mapped_column(
        Integer, ForeignKey("shadowedvaca.users.id", ondelete="CASCADE"), primary_key=True
    )
    can_view:   Mapped[bool]     = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship()
```

### Design notes

- No `DEFAULT` on `can_view` — matches the migration (presence of a row always means an explicit decision).
- `updated_at` has `onupdate=func.now()` for ORM-level updates. **Important:** Phase 3 uses `pg_insert(...).on_conflict_do_update(...)` which bypasses the ORM, so `updated_at` must be explicitly included in the `set_=` dict of every upsert — `"updated_at": func.now()`.
- The `relationship()` to `User` is needed so Phase 3 can join usernames in a single query rather than N+1 selects.
- No reverse relationship on `User` is needed.
- All necessary imports (`Boolean`, `ForeignKey`, `Integer`, `TIMESTAMP`, `func`, `Mapped`, `mapped_column`, `relationship`) are already present in the file — no new imports required.

---

## Steps

1. Read `src/sv_site/models.py` in full so you understand the existing structure.
2. Add the `IdeaAccessOverride` class at the bottom, after `IdeaFavorite`.
3. No imports need to change.
4. Commit and push:
   ```bash
   git add src/sv_site/models.py
   git commit -m "feat(ideas): add IdeaAccessOverride ORM model"
   git push
   ```
5. No server restart needed — the model class is just Python, unused until Phase 3 imports it.

---

## Done When

- `IdeaAccessOverride` class exists in `src/sv_site/models.py`
- File is committed and pushed
- No other files changed
