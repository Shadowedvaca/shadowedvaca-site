"""FastAPI application entry point for Shadowedvaca Site API."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sv_site.config import get_settings
from sv_site.routes.admin import router as admin_router
from sv_site.routes.auth import router as auth_router
from sv_site.routes.feedback_ingest import router as feedback_ingest_router
from sv_site.routes.feedback_read import router as feedback_read_router
from sv_site.routes.idea_reactions import router as idea_reactions_router
from sv_site.routes.ideas import router as ideas_router

_settings = get_settings()

app = FastAPI(title="Shadowedvaca Site API", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(feedback_ingest_router)
app.include_router(feedback_read_router)
app.include_router(idea_reactions_router)
app.include_router(ideas_router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"ok": True}
