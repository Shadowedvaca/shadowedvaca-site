"""Ideas proxy — fetches from sv-tools and returns to authenticated clients."""

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from typing import Optional

from sv_site.auth import require_auth
from sv_site.config import get_settings

router = APIRouter(prefix="/ideas", tags=["Ideas"])


def _sv_tools_url() -> str:
    return get_settings().sv_tools_url.rstrip("/")


@router.get("")
async def get_ideas(
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    _user: dict = Depends(require_auth),
) -> dict:
    """Proxy to sv-tools public ideas endpoint. Requires JWT."""
    params: dict = {"limit": limit}
    if status:
        params["status"] = status
    url = f"{_sv_tools_url()}/api/v1/ideas/public"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, params=params)
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
    """Proxy to sv-tools idea detail endpoint. Requires JWT."""
    url = f"{_sv_tools_url()}/api/v1/ideas/public/{idea_id}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail="sv-tools error")
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="sv-tools unavailable")
