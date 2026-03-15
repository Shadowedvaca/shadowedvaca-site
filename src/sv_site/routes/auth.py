"""Auth routes: login, register, invite, me."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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
from sv_site.models import User
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
    # Validate and consume invite code first
    try:
        await consume_invite_code(db, body.inviteCode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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

    token = create_access_token(
        user_id=user.id, username=user.username, is_admin=user.is_admin
    )
    return {"token": token, "username": user.username, "isAdmin": user.is_admin}


# ---------------------------------------------------------------------------
# POST /api/auth/invite
# ---------------------------------------------------------------------------


@router.post("/auth/invite")
async def create_invite(
    _user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not _user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    user_id: int | None = _user.get("user_id")
    code = await generate_invite_code(db, created_by_user_id=user_id)
    site_url = get_settings().site_url.rstrip("/")
    invite_url = f"{site_url}/register.html?code={code}"
    return {"invite_url": invite_url}


# ---------------------------------------------------------------------------
# GET /api/auth/me
# ---------------------------------------------------------------------------


@router.get("/auth/me")
async def me(_user: dict = Depends(require_auth)) -> dict:
    return {
        "user_id": _user.get("user_id"),
        "username": _user.get("username"),
        "isAdmin": _user.get("is_admin", False),
    }
