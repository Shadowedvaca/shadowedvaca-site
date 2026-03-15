"""Admin routes: user and permission management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from sv_site.auth import require_auth
from sv_site.database import get_db
from sv_site.models import User, UserPermission
from sv_site.tools import GRANTABLE_SLUGS, LOCKED_SLUGS, TOOLS

router = APIRouter(prefix="/admin", tags=["Admin"])


def _require_admin(user: dict = Depends(require_auth)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------------------------------------------------------------------------
# GET /api/admin/tools  — static registry
# ---------------------------------------------------------------------------


@router.get("/tools")
async def list_tools(_: dict = Depends(_require_admin)) -> list[dict]:
    return TOOLS


# ---------------------------------------------------------------------------
# GET /api/admin/users
# ---------------------------------------------------------------------------


@router.get("/users")
async def list_users(
    _: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(User).options(selectinload(User.permissions)).order_by(User.id)
    )
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "is_admin": u.is_admin,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat(),
            "permissions": list(LOCKED_SLUGS | {p.tool_slug for p in u.permissions}),
        }
        for u in users
    ]


# ---------------------------------------------------------------------------
# PUT /api/admin/users/{user_id}/permissions
# ---------------------------------------------------------------------------


class PermissionsRequest(BaseModel):
    permissions: list[str]


@router.put("/users/{user_id}/permissions")
async def set_permissions(
    user_id: int,
    body: PermissionsRequest,
    _admin: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Verify user exists and is not an admin (admins have implicit all-access)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Admin users have implicit full access")

    # Only accept valid grantable slugs; locked slugs are always implicit
    clean = [s for s in body.permissions if s in GRANTABLE_SLUGS]

    # Replace all permission rows for this user
    await db.execute(
        delete(UserPermission).where(UserPermission.user_id == user_id)
    )
    for slug in clean:
        db.add(UserPermission(user_id=user_id, tool_slug=slug))

    return {"user_id": user_id, "permissions": list(LOCKED_SLUGS) + clean}


# ---------------------------------------------------------------------------
# DELETE /api/admin/users/{user_id}
# ---------------------------------------------------------------------------


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    _admin: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Cannot delete admin users")
    if user.id == _admin.get("user_id"):
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    await db.delete(user)
    return {"ok": True}
