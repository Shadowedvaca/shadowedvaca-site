"""Ideas proxy — fetches from sv-tools and returns to authenticated clients."""

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sv_site.auth import require_auth
from sv_site.config import get_settings
from sv_site.database import get_db
from sv_site.models import IdeaAccessOverride

router = APIRouter(prefix="/ideas", tags=["Ideas"])


def _sv_tools_url() -> str:
    return get_settings().sv_tools_url.rstrip("/")


def _admin_headers() -> dict:
    key = get_settings().sv_tools_api_key
    return {"X-API-Key": key} if key else {}


@router.get("")
async def get_ideas(
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    _user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Proxy to sv-tools. Admins get all ideas; others get public + override-filtered."""
    is_admin: bool = _user.get("is_admin", False)
    params: dict = {"limit": limit}
    if status:
        params["status"] = status

    url = f"{_sv_tools_url()}/api/v1/ideas"
    headers = _admin_headers()

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail="sv-tools error")
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="sv-tools unavailable")

    if is_admin:
        return data

    user_id: int = _user["user_id"]
    ideas = data.get("ideas", [])

    result = await db.execute(
        select(IdeaAccessOverride.idea_id, IdeaAccessOverride.can_view)
        .where(IdeaAccessOverride.user_id == user_id)
    )
    overrides_map = {row.idea_id: row.can_view for row in result.all()}

    visible = [
        idea for idea in ideas
        if overrides_map.get(idea["id"], idea.get("public", False))
    ]
    return {"ideas": visible}


@router.get("/{idea_id}")
async def get_idea(
    idea_id: str = Path(...),
    _user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Proxy to sv-tools idea detail. Admins can access non-public ideas; others filtered by overrides."""
    is_admin: bool = _user.get("is_admin", False)
    user_id: int = _user["user_id"]

    url = f"{_sv_tools_url()}/api/v1/ideas/{idea_id}"
    headers = _admin_headers()

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 404:
                raise HTTPException(status_code=404, detail="Not found")
            resp.raise_for_status()
            data = resp.json()
        except HTTPException:
            raise
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail="sv-tools error")
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="sv-tools unavailable")

    if is_admin:
        return data

    idea = data.get("idea", {})

    result = await db.execute(
        select(IdeaAccessOverride.can_view)
        .where(
            IdeaAccessOverride.idea_id == int(idea_id),
            IdeaAccessOverride.user_id == user_id,
        )
    )
    override = result.scalar_one_or_none()

    if override is not None:
        can_see = override
    else:
        can_see = idea.get("public", False)

    if not can_see:
        raise HTTPException(status_code=404, detail="Not found")

    return data


@router.get("/{idea_id}/artifacts")
async def get_idea_artifacts(
    idea_id: str = Path(...),
    _user: dict = Depends(require_auth),
) -> dict:
    """Proxy to sv-tools artifacts list for an idea."""
    url = f"{_sv_tools_url()}/api/v1/ideas/{idea_id}/artifacts"
    headers = _admin_headers()

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail="sv-tools error")
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="sv-tools unavailable")


@router.get("/{idea_id}/artifacts/{artifact_id}")
async def get_idea_artifact(
    idea_id: str = Path(...),
    artifact_id: str = Path(...),
    _user: dict = Depends(require_auth),
) -> dict:
    """Proxy to sv-tools artifact detail. Returns full artifact content."""
    is_admin: bool = _user.get("is_admin", False)
    url = f"{_sv_tools_url()}/api/v1/ideas/{idea_id}/artifacts/{artifact_id}"
    headers = _admin_headers() if is_admin else {}

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=e.response.status_code, detail="sv-tools error"
            )
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="sv-tools unavailable")
