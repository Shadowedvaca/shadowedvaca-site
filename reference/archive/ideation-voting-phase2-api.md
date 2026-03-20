# Phase F-V.2 — FastAPI Reaction Endpoints

**Branch:** `ideation-voting` (off `main`)
**Prereq:** Phase F-V.1 complete (tables exist, models in `models.py`).
Read `reference/ideation-voting-plan.md` for full context.

---

## Goal
Create `src/sv_site/routes/idea_reactions.py` with five endpoints, then
register the router in `main.py`.

---

## Endpoint Summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/ideas/reactions` | any logged-in user | Bulk counts + my state + (admin) breakdown |
| PUT | `/api/ideas/{id}/vote` | any logged-in user | Cast or change vote (`{"vote": 1\|-1}`) |
| DELETE | `/api/ideas/{id}/vote` | any logged-in user | Retract vote |
| PUT | `/api/ideas/{id}/favorite` | any logged-in user | Set favorite |
| DELETE | `/api/ideas/{id}/favorite` | any logged-in user | Remove favorite |

---

## Step 1 — Create the route file

Create `src/sv_site/routes/idea_reactions.py`:

```python
"""
Idea voting and favorites — reactions endpoints.

All routes require a valid JWT (require_auth dependency).
Vote/favorite data lives in sv-site's own DB; idea IDs come from sv-tools.
"""

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from sv_site.auth import require_auth
from sv_site.database import get_db
from sv_site.models import IdeaFavorite, IdeaVote, User

router = APIRouter(prefix="/api/ideas", tags=["Idea Reactions"])


# ---------------------------------------------------------------------------
# Pydantic payloads
# ---------------------------------------------------------------------------


class VotePayload(BaseModel):
    vote: int = Field(..., description="1 for up, -1 for down")

    def validate_vote(self) -> int:
        if self.vote not in (1, -1):
            raise ValueError("vote must be 1 or -1")
        return self.vote


# ---------------------------------------------------------------------------
# GET /api/ideas/reactions
# ---------------------------------------------------------------------------


@router.get("/reactions")
async def get_reactions(
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Return aggregated reaction data for all ideas.

    Response shape:
    {
      "reactions": {
        "<idea_id>": {
          "score": int,          # ups - downs
          "ups": int,
          "downs": int,
          "favorites": int,
          "my_vote": 1 | -1 | null,
          "my_favorite": bool,
          # admin-only fields:
          "voters": [{"username": str, "vote": 1|-1}],   # omitted for non-admins
          "favorited_by": ["username", ...]               # omitted for non-admins
        }
      }
    }
    """
    user_id: int = user["user_id"]
    is_admin: bool = user.get("is_admin", False)

    # --- Aggregate vote counts per idea ---
    vote_agg = await db.execute(
        select(
            IdeaVote.idea_id,
            func.sum(IdeaVote.vote).label("score"),
            func.sum(func.cast(IdeaVote.vote == 1,  type_=None)).label("ups"),
            func.sum(func.cast(IdeaVote.vote == -1, type_=None)).label("downs"),
        ).group_by(IdeaVote.idea_id)
    )
    vote_rows = vote_agg.all()

    # --- Aggregate favorite counts per idea ---
    fav_agg = await db.execute(
        select(
            IdeaFavorite.idea_id,
            func.count().label("favorites"),
        ).group_by(IdeaFavorite.idea_id)
    )
    fav_rows = fav_agg.all()

    # --- Current user's votes ---
    my_votes_result = await db.execute(
        select(IdeaVote.idea_id, IdeaVote.vote).where(IdeaVote.user_id == user_id)
    )
    my_votes = {row.idea_id: row.vote for row in my_votes_result.all()}

    # --- Current user's favorites ---
    my_favs_result = await db.execute(
        select(IdeaFavorite.idea_id).where(IdeaFavorite.user_id == user_id)
    )
    my_favs = {row.idea_id for row in my_favs_result.all()}

    # --- Admin breakdown (who voted what / who favorited) ---
    voter_detail: dict[int, list] = {}
    fav_detail: dict[int, list] = {}
    if is_admin:
        all_votes_result = await db.execute(
            select(IdeaVote.idea_id, IdeaVote.vote, User.username)
            .join(User, User.id == IdeaVote.user_id)
        )
        for row in all_votes_result.all():
            voter_detail.setdefault(row.idea_id, []).append(
                {"username": row.username, "vote": row.vote}
            )

        all_favs_result = await db.execute(
            select(IdeaFavorite.idea_id, User.username)
            .join(User, User.id == IdeaFavorite.user_id)
        )
        for row in all_favs_result.all():
            fav_detail.setdefault(row.idea_id, []).append(row.username)

    # --- Merge everything into a single dict keyed by idea_id ---
    reactions: dict[str, dict] = {}

    # Seed from vote aggregates
    for row in vote_rows:
        iid = str(row.idea_id)
        reactions[iid] = {
            "score":    int(row.score or 0),
            "ups":      int(row.ups   or 0),
            "downs":    int(row.downs or 0),
            "favorites": 0,
            "my_vote":     my_votes.get(row.idea_id),
            "my_favorite": row.idea_id in my_favs,
        }
        if is_admin:
            reactions[iid]["voters"]       = voter_detail.get(row.idea_id, [])
            reactions[iid]["favorited_by"] = fav_detail.get(row.idea_id, [])

    # Merge favorite counts (some ideas may only have favorites, no votes)
    for row in fav_rows:
        iid = str(row.idea_id)
        if iid not in reactions:
            reactions[iid] = {
                "score": 0, "ups": 0, "downs": 0,
                "my_vote": my_votes.get(row.idea_id),
                "my_favorite": row.idea_id in my_favs,
            }
            if is_admin:
                reactions[iid]["voters"]       = voter_detail.get(row.idea_id, [])
                reactions[iid]["favorited_by"] = fav_detail.get(row.idea_id, [])
        reactions[iid]["favorites"] = int(row.favorites)

    return {"reactions": reactions}


# ---------------------------------------------------------------------------
# PUT /api/ideas/{idea_id}/vote
# ---------------------------------------------------------------------------


@router.put("/{idea_id}/vote")
async def put_vote(
    idea_id: int = Path(...),
    payload: VotePayload = ...,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Cast or update a vote (+1 / -1) on an idea. One vote per user per idea."""
    if payload.vote not in (1, -1):
        raise HTTPException(status_code=422, detail="vote must be 1 or -1")

    user_id: int = user["user_id"]

    stmt = (
        pg_insert(IdeaVote)
        .values(user_id=user_id, idea_id=idea_id, vote=payload.vote)
        .on_conflict_do_update(
            index_elements=["user_id", "idea_id"],
            set_={"vote": payload.vote},
        )
    )
    await db.execute(stmt)
    await db.commit()
    return {"ok": True, "idea_id": idea_id, "vote": payload.vote}


# ---------------------------------------------------------------------------
# DELETE /api/ideas/{idea_id}/vote
# ---------------------------------------------------------------------------


@router.delete("/{idea_id}/vote")
async def delete_vote(
    idea_id: int = Path(...),
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Retract the current user's vote on an idea."""
    user_id: int = user["user_id"]
    await db.execute(
        delete(IdeaVote).where(
            IdeaVote.user_id == user_id, IdeaVote.idea_id == idea_id
        )
    )
    await db.commit()
    return {"ok": True, "idea_id": idea_id}


# ---------------------------------------------------------------------------
# PUT /api/ideas/{idea_id}/favorite
# ---------------------------------------------------------------------------


@router.put("/{idea_id}/favorite")
async def put_favorite(
    idea_id: int = Path(...),
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Mark an idea as a favorite. Idempotent."""
    user_id: int = user["user_id"]

    stmt = (
        pg_insert(IdeaFavorite)
        .values(user_id=user_id, idea_id=idea_id)
        .on_conflict_do_nothing(index_elements=["user_id", "idea_id"])
    )
    await db.execute(stmt)
    await db.commit()
    return {"ok": True, "idea_id": idea_id, "favorited": True}


# ---------------------------------------------------------------------------
# DELETE /api/ideas/{idea_id}/favorite
# ---------------------------------------------------------------------------


@router.delete("/{idea_id}/favorite")
async def delete_favorite(
    idea_id: int = Path(...),
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Remove a favorite. Idempotent."""
    user_id: int = user["user_id"]
    await db.execute(
        delete(IdeaFavorite).where(
            IdeaFavorite.user_id == user_id, IdeaFavorite.idea_id == idea_id
        )
    )
    await db.commit()
    return {"ok": True, "idea_id": idea_id, "favorited": False}
```

---

## Step 2 — Register the router in `main.py`

File: `src/sv_site/main.py`

Add the import and `include_router` call.  The reactions router must be registered
**before** the ideas proxy router, because both share the `/api/ideas` prefix and
FastAPI matches routes in registration order.  The concrete paths (`/reactions`,
`/{id}/vote`, `/{id}/favorite`) won't conflict with the proxy's `""` and `/{id}`
paths, but order still matters for clarity.

```python
# Add this import alongside the others:
from sv_site.routes.idea_reactions import router as idea_reactions_router

# Add this include_router call BEFORE the existing ideas_router line:
app.include_router(idea_reactions_router)
app.include_router(ideas_router, prefix="/api")
```

After the change, the router registration block should look like:

```python
app.include_router(auth_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(feedback_ingest_router)
app.include_router(feedback_read_router)
app.include_router(idea_reactions_router)        # ← new
app.include_router(ideas_router, prefix="/api")
```

---

## Step 3 — Smoke test

Restart the app, then test with curl or the browser (JWT required):

```bash
# From Git Bash, replace <TOKEN> with a valid JWT from localStorage
TOKEN="<your-jwt-here>"

# Should return {"reactions": {}}  (empty until someone votes)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/ideas/reactions | python -m json.tool

# Vote +1 on idea 1
curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vote": 1}' \
  http://localhost:8000/api/ideas/1/vote

# Verify it appears in reactions
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/ideas/reactions | python -m json.tool

# Favorite idea 1
curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/ideas/1/favorite

# Delete vote
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/ideas/1/vote

# Delete favorite
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/ideas/1/favorite
```

Expected: all return `{"ok": true, ...}`, and reactions endpoint reflects the state.

---

## Done
Phase 2 complete when:
- [ ] `src/sv_site/routes/idea_reactions.py` exists with all 5 endpoints
- [ ] `main.py` imports and registers `idea_reactions_router` before `ideas_router`
- [ ] App starts without errors
- [ ] Smoke tests pass (vote, favorite, read reactions, delete both)

Proceed to `reference/ideation-voting-phase3-frontend.md`.
