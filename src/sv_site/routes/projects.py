"""Projects proxy — fetches from sv-tools and returns to authenticated clients."""

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path

from sv_site.auth import require_auth
from sv_site.config import get_settings

router = APIRouter(prefix="/projects", tags=["Projects"])


def _sv_tools_url() -> str:
    return get_settings().sv_tools_url.rstrip("/")


def _admin_headers() -> dict:
    key = get_settings().sv_tools_api_key
    return {"X-API-Key": key} if key else {}


@router.get("")
async def get_projects(
    _user: dict = Depends(require_auth),
) -> dict:
    """Proxy to sv-tools active projects list."""
    url = f"{_sv_tools_url()}/api/v1/projects"
    headers = _admin_headers()

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, params={"active_only": "true"}, headers=headers)
            resp.raise_for_status()
            return {"projects": resp.json()}
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail="sv-tools error")
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="sv-tools unavailable")


@router.get("/{name}/documents")
async def get_project_documents(
    name: str = Path(...),
    _user: dict = Depends(require_auth),
) -> dict:
    """Proxy to sv-tools project documents list."""
    url = f"{_sv_tools_url()}/api/v1/projects/{name}/documents"
    headers = _admin_headers()

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 404:
                raise HTTPException(status_code=404, detail="Project not found")
            resp.raise_for_status()
            return {"documents": resp.json()}
        except HTTPException:
            raise
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail="sv-tools error")
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="sv-tools unavailable")


@router.get("/{name}/phases")
async def get_project_phases(
    name: str = Path(...),
    _user: dict = Depends(require_auth),
) -> dict:
    """Proxy to sv-tools project phases list."""
    url = f"{_sv_tools_url()}/api/v1/projects/{name}/phases"
    headers = _admin_headers()

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 404:
                raise HTTPException(status_code=404, detail="Project not found")
            resp.raise_for_status()
            return {"phases": resp.json()}
        except HTTPException:
            raise
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail="sv-tools error")
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="sv-tools unavailable")
