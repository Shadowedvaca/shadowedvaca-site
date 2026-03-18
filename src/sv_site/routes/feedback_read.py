"""
GET /api/hub/feedback
Admin-only endpoint. Returns paginated feedback records from the Hub's local DB.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from sv_site.auth import require_auth
from sv_site.database import get_db
from sv_site.models import CustomerFeedback
from fastapi import HTTPException

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/hub/feedback", tags=["feedback"])


def _require_admin(user: dict = Depends(require_auth)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def _serialize(record: CustomerFeedback) -> dict:
    return {
        "id":                    record.id,
        "program_name":          record.program_name,
        "received_at":           record.received_at.isoformat() if record.received_at else None,
        "is_authenticated_user": record.is_authenticated_user,
        "is_anonymous":          record.is_anonymous,
        "privacy_token":         record.privacy_token[:8] + "…" if record.privacy_token else None,
        "score":                 record.score,
        "raw_feedback":          record.raw_feedback,
        "summary":               record.summary,
        "sentiment":             record.sentiment,
        "tags":                  record.tags or [],
        "processed_at":          record.processed_at.isoformat() if record.processed_at else None,
        "processing_error":      record.processing_error,
    }


@router.get("")
async def list_feedback(
    program_name: Optional[str] = Query(None),
    sentiment:    Optional[str] = Query(None),
    tag:          Optional[str] = Query(None),
    min_score:    Optional[int] = Query(None, ge=1, le=10),
    max_score:    Optional[int] = Query(None, ge=1, le=10),
    limit:        int           = Query(50, ge=1, le=200),
    offset:       int           = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user=Depends(_require_admin),
):
    q = select(CustomerFeedback)

    if program_name:
        q = q.where(CustomerFeedback.program_name == program_name)
    if sentiment:
        q = q.where(CustomerFeedback.sentiment == sentiment)
    if tag:
        q = q.where(CustomerFeedback.tags.contains([tag]))
    if min_score is not None:
        q = q.where(CustomerFeedback.score >= min_score)
    if max_score is not None:
        q = q.where(CustomerFeedback.score <= max_score)

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    data_q = q.order_by(desc(CustomerFeedback.received_at)).limit(limit).offset(offset)
    rows = (await db.execute(data_q)).scalars().all()

    return {
        "ok": True,
        "data": {
            "feedback": [_serialize(r) for r in rows],
            "total": total,
        },
    }


@router.get("/programs")
async def list_programs(
    db: AsyncSession = Depends(get_db),
    _user=Depends(_require_admin),
):
    """Distinct program names — used to populate the filter dropdown."""
    q = select(CustomerFeedback.program_name).distinct()
    rows = (await db.execute(q)).scalars().all()
    return {"ok": True, "data": {"programs": sorted(rows)}}
