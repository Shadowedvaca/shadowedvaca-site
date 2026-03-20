"""
Admin endpoints for per-user idea access overrides.

All routes are admin-only. Override data lives in sv-site's own DB.
"""

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from sv_site.auth import require_auth
from sv_site.database import get_db
from sv_site.models import IdeaAccessOverride, User

router = APIRouter(prefix="/api/admin/ideas", tags=["Idea Access"])


def _require_admin(user: dict = Depends(require_auth)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


class AccessOverrideRequest(BaseModel):
    can_view: bool


# ---------------------------------------------------------------------------
# GET /api/admin/ideas/{idea_id}/access
# ---------------------------------------------------------------------------


@router.get("/{idea_id}/access")
async def get_idea_access(
    idea_id: int = Path(...),
    _admin: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return all non-admin active users with their override state for this idea."""
    # All non-admin active users
    users_result = await db.execute(
        select(User.id, User.username)
        .where(User.is_admin == False, User.is_active == True)
        .order_by(User.username)
    )
    users = users_result.all()

    # All overrides for this idea
    overrides_result = await db.execute(
        select(IdeaAccessOverride.user_id, IdeaAccessOverride.can_view)
        .where(IdeaAccessOverride.idea_id == idea_id)
    )
    overrides = {row.user_id: row.can_view for row in overrides_result.all()}

    return {
        "idea_id": idea_id,
        "users": [
            {
                "user_id": u.id,
                "username": u.username,
                "override": overrides.get(u.id),  # None if no row
            }
            for u in users
        ],
    }


# ---------------------------------------------------------------------------
# PUT /api/admin/ideas/{idea_id}/access/{user_id}
# ---------------------------------------------------------------------------


@router.put("/{idea_id}/access/{user_id}")
async def set_idea_access(
    idea_id: int = Path(...),
    user_id: int = Path(...),
    body: AccessOverrideRequest = ...,
    _admin: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Upsert an access override for a specific user+idea pair."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Admins always have full access; overrides are meaningless")

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
    return {"ok": True, "idea_id": idea_id, "user_id": user_id, "can_view": body.can_view}


# ---------------------------------------------------------------------------
# DELETE /api/admin/ideas/{idea_id}/access/{user_id}
# ---------------------------------------------------------------------------


@router.delete("/{idea_id}/access/{user_id}")
async def delete_idea_access(
    idea_id: int = Path(...),
    user_id: int = Path(...),
    _admin: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Remove an access override, reverting the user to the idea's default visibility."""
    await db.execute(
        delete(IdeaAccessOverride).where(
            IdeaAccessOverride.idea_id == idea_id,
            IdeaAccessOverride.user_id == user_id,
        )
    )
    await db.commit()
    return {"ok": True, "idea_id": idea_id, "user_id": user_id}
