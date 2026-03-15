"""Authentication utilities for sv_site.

JWT creation/validation and invite code helpers.
Uses sv_common.auth.passwords for bcrypt.
"""

import random
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sv_site.config import get_settings
from sv_site.models import InviteCode, User
from sv_common.auth.passwords import hash_password, verify_password  # noqa: F401 (re-exported)

_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L
_CODE_LENGTH = 8


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------


def create_access_token(user_id: int, username: str, is_admin: bool) -> str:
    """Create a signed JWT for the given user."""
    settings = get_settings()
    payload = {
        "user_id": user_id,
        "username": username,
        "is_admin": is_admin,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT. Returns payload dict.

    Raises jwt.ExpiredSignatureError if expired.
    Raises jwt.InvalidTokenError for any other validation failure.
    """
    settings = get_settings()
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])


async def require_auth(
    authorization: str | None = Header(None),
) -> dict:
    """FastAPI dependency: validate JWT Bearer token. Returns token payload."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        try:
            return decode_access_token(token)
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")

    raise HTTPException(status_code=401, detail="Authentication required")


# ---------------------------------------------------------------------------
# Invite codes
# ---------------------------------------------------------------------------


def _generate_code() -> str:
    return "".join(random.choices(_CHARSET, k=_CODE_LENGTH))


async def generate_invite_code(
    db: AsyncSession,
    created_by_user_id: int,
    expires_hours: int = 48,
    permissions: list[str] | None = None,
) -> str:
    """Generate an invite code. Returns the code string."""
    code = _generate_code()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=expires_hours)
    invite = InviteCode(
        code=code,
        created_by_user_id=created_by_user_id,
        expires_at=expires_at,
        permissions=permissions or [],
    )
    db.add(invite)
    await db.flush()
    return code


async def validate_invite_code(db: AsyncSession, code: str) -> InviteCode | None:
    """Return the InviteCode if valid (exists, not used, not expired). Otherwise None."""
    result = await db.execute(select(InviteCode).where(InviteCode.code == code))
    invite = result.scalar_one_or_none()
    if invite is None:
        return None
    if invite.used_at is not None:
        return None
    if invite.expires_at is not None:
        now = datetime.now(timezone.utc)
        expires = invite.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if now > expires:
            return None
    return invite


async def consume_invite_code(db: AsyncSession, code: str) -> InviteCode:
    """Mark the invite code as used. Returns the updated InviteCode.

    Raises ValueError if the code is invalid, already used, or expired.
    """
    invite = await validate_invite_code(db, code)
    if invite is None:
        raise ValueError(f"Invite code '{code}' is invalid, already used, or expired.")
    invite.used_at = datetime.now(timezone.utc)
    await db.flush()
    return invite


# ---------------------------------------------------------------------------
# User helpers
# ---------------------------------------------------------------------------


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(select(User).where(User.username == username.lower().strip()))
    return result.scalar_one_or_none()
