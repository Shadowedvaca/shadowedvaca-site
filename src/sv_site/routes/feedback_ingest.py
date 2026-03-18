"""
POST /api/feedback/ingest
Public endpoint — client apps submit de-identified feedback payloads.
Protected by X-Ingest-Key header (shared secret).
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from sv_site.config import Settings, get_settings
from sv_site.database import get_db
from sv_site.feedback_processor import process_feedback
from sv_site.models import CustomerFeedback

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/feedback", tags=["feedback"])


class IngestPayload(BaseModel):
    program_name:          str  = Field(..., min_length=1, max_length=80)
    score:                 int  = Field(..., ge=1, le=10)
    raw_feedback:          str  = Field(..., min_length=1, max_length=10000)
    is_authenticated_user: bool = False
    is_anonymous:          bool = False
    privacy_token:         Optional[str] = Field(None, max_length=64)


async def _require_ingest_key(
    x_ingest_key: str = Header(default=""),
    settings: Settings = Depends(get_settings),
) -> None:
    expected = settings.feedback_ingest_key
    if not expected or x_ingest_key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Ingest-Key")


@router.post("/ingest")
async def ingest_feedback(
    payload: IngestPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_ingest_key),
    settings: Settings = Depends(get_settings),
):
    """
    Receive a de-identified feedback payload from a client app.
    Stores the record, runs AI processing, returns hub_feedback_id.
    """

    # Enforce privacy: never store a token for anonymous submissions
    token = None if payload.is_anonymous else payload.privacy_token

    record = CustomerFeedback(
        program_name=payload.program_name,
        is_authenticated_user=payload.is_authenticated_user,
        is_anonymous=payload.is_anonymous,
        privacy_token=token,
        score=payload.score,
        raw_feedback=payload.raw_feedback,
    )
    db.add(record)
    await db.flush()          # get the generated id before AI call
    feedback_id = record.id

    # AI processing — synchronous but fast (Haiku)
    ai = await process_feedback(
        raw_feedback=payload.raw_feedback,
        score=payload.score,
        program_name=payload.program_name,
        api_key=settings.anthropic_api_key,  # type: ignore[arg-type]
    )

    record.summary          = ai.get("summary")
    record.sentiment        = ai.get("sentiment")
    record.tags             = ai.get("tags")
    record.processed_at     = datetime.now(timezone.utc) if not ai.get("error") else None
    record.processing_error = ai.get("error")

    await db.commit()

    logger.info("Feedback ingested: id=%d program=%s sentiment=%s",
                feedback_id, payload.program_name, record.sentiment)

    return {"ok": True, "hub_feedback_id": feedback_id}
