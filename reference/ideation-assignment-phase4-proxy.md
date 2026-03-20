# Phase 4 — Proxy Enforcement

## Context

This is phase 4 of 6 for the ideation board per-user access control feature. Read `reference/ideation-assignment-plan.md` for the full picture.

**Prereqs:** Phases 1–3 complete (table exists, model exists, admin endpoints live).

This is the only phase that changes existing behavior. After this phase, non-admin users' idea lists are filtered through the override table in addition to sv-tools' public flag. **Deploy this atomically with Phase 3 (or after)** — never deploy Phase 4 alone, since enforcement without the ability to set overrides would lock people out with no way to grant access.

---

## What to Build

Modify `src/sv_site/routes/ideas.py` only.

---

## Current Behavior (to understand before changing)

Read `src/sv_site/routes/ideas.py` in full before making any changes.

Currently:
- **Admins:** `GET /api/v1/ideas` on sv-tools (admin endpoint, sees everything)
- **Non-admins:** `GET /api/v1/ideas/public` on sv-tools (public-only endpoint)

The proxy passes through whatever sv-tools returns with no local filtering.

---

## New Behavior

### The access rule

```
visible = overrides_map.get(idea_id, idea["public"])
```

One line. If an override exists for this user+idea, use it. Otherwise use `idea["public"]` from sv-tools. No other cases.

### Strategy for non-admins

Switch non-admins to call the **sv-tools admin endpoint** (`GET /api/v1/ideas` with `_admin_headers()`). This returns all ideas including secret ones. Then filter the list locally using the rule above, querying the `idea_access_overrides` table for this user's overrides.

This means non-admins now require a DB query. Both `get_ideas` and `get_idea` must add `db: AsyncSession = Depends(get_db)` to their signatures.

---

## Changes to `get_ideas`

### New signature

Add `db: AsyncSession = Depends(get_db)` parameter.

### Admin path — no change

Admins still call the sv-tools admin endpoint and return everything. No DB query.

### Non-admin path — replace the existing branch

Old code calls `GET /api/v1/ideas/public`. Replace with:

1. Call `GET /api/v1/ideas` using `_admin_headers()` (same as admin, but we filter locally).
2. Parse the response: `ideas = data.get("ideas", [])`.
3. Query overrides for this user:
   ```python
   result = await db.execute(
       select(IdeaAccessOverride.idea_id, IdeaAccessOverride.can_view)
       .where(IdeaAccessOverride.user_id == user_id)
   )
   overrides_map = {row.idea_id: row.can_view for row in result.all()}
   ```
4. Filter:
   ```python
   visible = [
       idea for idea in ideas
       if overrides_map.get(idea["id"], idea.get("public", False))
   ]
   ```
5. Return `{"ideas": visible}`.

The response envelope is identical to before — the frontend sees no structural change.

---

## Changes to `get_idea`

### New signature

Add `db: AsyncSession = Depends(get_db)` parameter.
Also add `user_id: int = _user["user_id"]` — extract it at the top of the function (it's used in both paths now).

### Admin path — no change

Admins still call the sv-tools admin endpoint and return pass-through.

### Non-admin path — replace the existing branch

Old code calls `GET /api/v1/ideas/public/{idea_id}`. Replace with:

1. Call `GET /api/v1/ideas/{idea_id}` using `_admin_headers()`.
2. If sv-tools returns 404, raise `HTTPException(404, "Not found")`.
3. Parse the idea: `idea = data.get("idea", {})`.
4. Query the override for this specific user+idea:
   ```python
   result = await db.execute(
       select(IdeaAccessOverride.can_view)
       .where(
           IdeaAccessOverride.idea_id == int(idea_id),
           IdeaAccessOverride.user_id == user_id,
       )
   )
   override = result.scalar_one_or_none()
   ```
5. Apply the rule:
   ```python
   if override is not None:
       can_see = override
   else:
       can_see = idea.get("public", False)
   ```
6. If `not can_see`: raise `HTTPException(404, "Not found")` — do NOT reveal that the idea exists.
7. Return the full data pass-through.

---

## Required New Imports for `ideas.py`

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sv_site.database import get_db
from sv_site.models import IdeaAccessOverride
```

These go at the top of `ideas.py` alongside the existing imports.

---

## Steps

1. Read `src/sv_site/routes/ideas.py` in full.
2. Add the four new imports.
3. Modify `get_ideas`: add `db` parameter, replace the non-admin branch.
4. Modify `get_idea`: add `db` and `user_id`, replace the non-admin branch.
5. Do not touch `get_idea_artifacts` or `get_idea_artifact` — they are unaffected.
6. Commit and push:
   ```bash
   git add src/sv_site/routes/ideas.py
   git commit -m "feat(ideas): enforce per-user access overrides in proxy"
   git push
   ```
7. Deploy to server:
   ```bash
   ssh -i ~/.ssh/va_hetzner_openssh root@5.78.114.224 \
     'cd /opt/shadowedvaca && git fetch origin && git reset --hard origin/main && systemctl restart shadowedvaca && sleep 2 && curl -s -o /dev/null -w "%{http_code}" https://shadowedvaca.com/api/health'
   ```

---

## Smoke Test

**As admin:**
1. Use `PUT /api/admin/ideas/30/access/{user_id}` to set `can_view: false` for a non-admin user on a public idea.

**As that non-admin user:**
2. `GET /api/ideas` — idea 30 should NOT appear.
3. `GET /api/ideas/30` — should return 404.

**Reset:**
4. As admin, `DELETE /api/admin/ideas/30/access/{user_id}` to remove override.
5. As that user, `GET /api/ideas` — idea 30 reappears.

**Secret idea grant:**
6. As admin, `PUT /api/admin/ideas/{secret_id}/access/{user_id}` with `can_view: true`.
7. As that user, `GET /api/ideas` — secret idea now appears.

---

## Done When

- Non-admin users filtered by overrides on the list endpoint
- Non-admin users blocked on the detail endpoint when `can_view = false` (or no override + idea is secret)
- Override `null` (no row) correctly falls back to `idea.public`
- Admin users completely unaffected
- Health check passes after restart
