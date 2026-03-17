"""Ideas proxy — fetches from sv-tools and returns to authenticated clients."""

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from typing import Optional

from sv_site.auth import require_auth
from sv_site.config import get_settings

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
) -> dict:
    """Proxy to sv-tools. Admins get all ideas; others get public only."""
    is_admin: bool = _user.get("is_admin", False)
    params: dict = {"limit": limit}
    if status:
        params["status"] = status

    if is_admin:
        url = f"{_sv_tools_url()}/api/v1/ideas"
        headers = _admin_headers()
    else:
        url = f"{_sv_tools_url()}/api/v1/ideas/public"
        headers = {}

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail="sv-tools error")
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="sv-tools unavailable")


@router.get("/{idea_id}")
async def get_idea(
    idea_id: str = Path(...),
    _user: dict = Depends(require_auth),
) -> dict:
    """Proxy to sv-tools idea detail. Admins can access non-public ideas."""
    is_admin: bool = _user.get("is_admin", False)

    if is_admin:
        url = f"{_sv_tools_url()}/api/v1/ideas/{idea_id}"
        headers = _admin_headers()
    else:
        url = f"{_sv_tools_url()}/api/v1/ideas/public/{idea_id}"
        headers = {}

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail="sv-tools error")
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="sv-tools unavailable")
