"""Auth routes: login, register, invite, me, change-password."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sv_site.auth import (
    consume_invite_code,
    create_access_token,
    generate_invite_code,
    get_user_by_username,
    require_auth,
)
from sv_site.config import get_settings
from sv_site.database import get_db
from sv_site.models import InviteCode, User, UserPermission
from sv_site.tools import GRANTABLE_SLUGS, LOCKED_SLUGS
from sv_common.auth.passwords import hash_password, verify_password

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /api/auth/login
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/auth/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> dict:
    user = await get_user_by_username(db, body.username)
    if user is None or not user.is_active or not verify_password(
        body.password, user.password_hash
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(
        user_id=user.id, username=user.username, is_admin=user.is_admin
    )
    return {"token": token, "username": user.username, "isAdmin": user.is_admin}


# ---------------------------------------------------------------------------
# POST /api/auth/register
# ---------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    username: str
    password: str
    inviteCode: str


@router.post("/auth/register", status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)) -> dict:
    # Validate and consume invite code, capture its permissions
    try:
        invite = await consume_invite_code(db, body.inviteCode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Re-fetch to read permissions column (consume_invite_code may not have loaded it)
    result = await db.execute(
        select(InviteCode).where(InviteCode.code == body.inviteCode)
    )
    invite_row = result.scalar_one_or_none()
    granted_slugs: list[str] = invite_row.permissions if invite_row else []

    # Check username not taken
    existing = await get_user_by_username(db, body.username)
    if existing is not None:
        raise HTTPException(status_code=409, detail="Username already taken")

    username = body.username.lower().strip()
    user = User(
        username=username,
        password_hash=hash_password(body.password),
        is_admin=False,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()

    # Apply non-locked permissions from the invite
    for slug in granted_slugs:
        if slug in GRANTABLE_SLUGS:
            db.add(UserPermission(user_id=user.id, tool_slug=slug))

    token = create_access_token(
        user_id=user.id, username=user.username, is_admin=user.is_admin
    )
    return {"token": token, "username": user.username, "isAdmin": user.is_admin}


# ---------------------------------------------------------------------------
# POST /api/auth/invite
# ---------------------------------------------------------------------------


class InviteRequest(BaseModel):
    permissions: list[str] = []


@router.post("/auth/invite")
async def create_invite(
    body: InviteRequest = InviteRequest(),
    _user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not _user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    # Only store valid, grantable slugs
    clean_perms = [s for s in body.permissions if s in GRANTABLE_SLUGS]

    user_id: int | None = _user.get("user_id")
    code = await generate_invite_code(db, created_by_user_id=user_id, permissions=clean_perms)
    site_url = get_settings().site_url.rstrip("/")
    invite_url = f"{site_url}/register.html?code={code}"
    return {"invite_url": invite_url, "code": code}


# ---------------------------------------------------------------------------
# GET /api/auth/me
# ---------------------------------------------------------------------------


@router.get("/auth/me")
async def me(
    _user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    user_id = _user.get("user_id")

    # Fresh DB lookup for is_admin (JWT may be stale)
    user_row = await db.execute(select(User.is_admin).where(User.id == user_id))
    is_admin: bool = user_row.scalar_one_or_none() or False

    # Load permission rows for this user
    result = await db.execute(
        select(UserPermission.tool_slug).where(
            UserPermission.user_id == user_id
        )
    )
    stored_slugs = [row[0] for row in result.all()]
    # Always include locked tools
    all_permissions = list(LOCKED_SLUGS | set(stored_slugs))

    return {
        "user_id": user_id,
        "username": _user.get("username"),
        "isAdmin": is_admin,
        "permissions": all_permissions,
    }


# ---------------------------------------------------------------------------
# POST /api/auth/change-password
# ---------------------------------------------------------------------------


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/auth/change-password")
async def change_password(
    body: ChangePasswordRequest,
    _user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    user = await get_user_by_username(db, _user["username"])
    if user is None or not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    await db.flush()
    return {"ok": True}
