# Phase 3 — Admin CRUD Endpoints

## Context

This is phase 3 of 6 for the ideation board per-user access control feature. Read `reference/ideation-assignment-plan.md` for the full picture.

**Prereqs:** Phases 1 and 2 complete (table exists, ORM model exists).

This phase adds three new admin-only API endpoints for reading and writing idea access overrides. The ideas proxy is not changed yet — non-admin users still see the same ideas they saw before. That enforcement comes in Phase 4.

---

## What to Build

- **New file:** `src/sv_site/routes/idea_access.py`
- **Modified file:** `src/sv_site/main.py`

---

## New File: `src/sv_site/routes/idea_access.py`

Read `src/sv_site/routes/idea_reactions.py` before writing this — it is the primary style reference for DB session injection, `pg_insert` upserts, and admin guards.

Read `src/sv_site/routes/admin.py` for the `_require_admin` helper pattern.

### Router setup

```python
router = APIRouter(prefix="/api/admin/ideas", tags=["Idea Access"])
```

### Admin guard

Define `_require_admin` inline (same pattern as `admin.py` — do not import it from there):

```python
def _require_admin(user: dict = Depends(require_auth)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
```

### Pydantic model

```python
class AccessOverrideRequest(BaseModel):
    can_view: bool
```

---

### Endpoint 1: `GET /api/admin/ideas/{idea_id}/access`

Returns all non-admin, active users with their current override state for this idea.

**Process:**
1. Require admin.
2. Query all non-admin active users ordered by username.
3. Query all override rows for this `idea_id`.
4. Build the response: for each user, include their override value (`true`/`false`) or `null` if no override row exists.

**Response shape:**
```json
{
  "idea_id": 30,
  "users": [
    {"user_id": 3, "username": "alice", "override": null},
    {"user_id": 7, "username": "bob",   "override": true},
    {"user_id": 9, "username": "carol", "override": false}
  ]
}
```

**Implementation note:** `override: null` means no row in `idea_access_overrides` for this user+idea. The frontend computes effective access as `override !== null ? override : idea.public`. The backend does not need to know `idea.public` — that comes from the already-loaded idea data on the frontend.

---

### Endpoint 2: `PUT /api/admin/ideas/{idea_id}/access/{user_id}`

Upserts an override row. Sets `can_view` explicitly for this user+idea pair.

**Process:**
1. Require admin.
2. Verify the target user exists and is not an admin (overrides on admins are meaningless — admins always see everything). Return 404 if not found, 400 if admin.
3. Upsert using `pg_insert`:
   ```python
   stmt = (
       pg_insert(IdeaAccessOverride)
       .values(idea_id=idea_id, user_id=user_id, can_view=body.can_view)
       .on_conflict_do_update(
           index_elements=["idea_id", "user_id"],
           set_={"can_view": body.can_view, "updated_at": func.now()},
       )
   )
   await db.execute(stmt)
   await db.commit()
   ```
   Note: `updated_at` must be in `set_=` explicitly because `pg_insert` bypasses the ORM's `onupdate` hook.

**Response:** `{"ok": True, "idea_id": idea_id, "user_id": user_id, "can_view": body.can_view}`

---

### Endpoint 3: `DELETE /api/admin/ideas/{idea_id}/access/{user_id}`

Removes the override row, reverting that user to default behavior (determined by `idea.public` in sv-tools).

**Process:**
1. Require admin.
2. Delete the row. Idempotent — if no row exists, that is fine.
3. Commit.

**Response:** `{"ok": True, "idea_id": idea_id, "user_id": user_id}`

---

### Required imports for `idea_access.py`

```python
from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from sv_site.auth import require_auth
from sv_site.database import get_db
from sv_site.models import IdeaAccessOverride, User
```

---

## Modified File: `src/sv_site/main.py`

Add the import and register the router. Register it **before** `idea_reactions_router` and `ideas_router`:

```python
from sv_site.routes.idea_access import router as idea_access_router
```

```python
app.include_router(idea_access_router)          # no prefix= — baked into the router
app.include_router(idea_reactions_router)
app.include_router(ideas_router, prefix="/api")
```

The router carries `/api/admin/ideas` as its own prefix, so no `prefix=` argument at include-time.

---

## Steps

1. Read `src/sv_site/routes/idea_reactions.py` and `src/sv_site/routes/admin.py` in full.
2. Write `src/sv_site/routes/idea_access.py`.
3. Modify `src/sv_site/main.py` to register the new router.
4. Commit and push:
   ```bash
   git add src/sv_site/routes/idea_access.py src/sv_site/main.py
   git commit -m "feat(ideas): add idea access override endpoints"
   git push
   ```
5. Deploy to server:
   ```bash
   ssh -i ~/.ssh/va_hetzner_openssh root@5.78.114.224 \
     'cd /opt/shadowedvaca && git fetch origin && git reset --hard origin/main && systemctl restart shadowedvaca && sleep 2 && curl -s -o /dev/null -w "%{http_code}" https://shadowedvaca.com/api/health'
   ```

## Smoke Test

Get a valid JWT from browser localStorage (`sv_site_jwt → token`), then:

```bash
TOKEN="<paste token>"

# List access for idea 30 (laundromat)
curl -s -H "Authorization: Bearer $TOKEN" \
  https://shadowedvaca.com/api/admin/ideas/30/access | python -m json.tool

# Grant a user access (replace 3 with a real user ID from the response)
curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"can_view": true}' \
  https://shadowedvaca.com/api/admin/ideas/30/access/3

# Revoke access
curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"can_view": false}' \
  https://shadowedvaca.com/api/admin/ideas/30/access/3

# Remove override (revert to default)
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  https://shadowedvaca.com/api/admin/ideas/30/access/3
```

---

## Done When

- `GET /api/admin/ideas/{id}/access` returns user list with override states
- `PUT` upserts correctly (verify with a second GET)
- `DELETE` removes the override (verify with a third GET showing `"override": null`)
- Non-admin token gets 403 on all three endpoints
- No changes to existing idea list behavior for non-admins yet (that is Phase 4)
