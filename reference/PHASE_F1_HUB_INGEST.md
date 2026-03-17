# Phase F.1 — Hub: Ingest Endpoint, DB, and AI Processing

> **Repo:** shadowedvaca-site
> **Branch:** `phase-feedback` (create fresh from `main`)
> **Depends on:** nothing — this is the foundation all other phases build on
> **Produces:** `shadowedvaca.customer_feedback` table, `POST /api/feedback/ingest`
> endpoint, Claude AI processing, unit tests

---

## Goal

Build the Hub's half of the feedback system:

1. A PostgreSQL table that stores de-identified feedback records (no PII)
2. A public ingest endpoint that client apps POST to
3. Claude AI processing that runs immediately after ingest, enriching the record
   with `summary`, `sentiment`, and `tags`

This is the only phase that touches the Hub server. All other phases (F.2, F.3)
are client-side and depend on this endpoint being live.

---

## Prerequisites

- Familiar with `src/sv_site/models.py` — ORM model pattern to follow
- Familiar with `src/sv_site/database.py` — how `get_db()` AsyncSession works
- Familiar with `src/sv_site/routes/auth.py` — route pattern to follow
- Familiar with `src/sv_site/config.py` — how to add new settings
- `src/sv_site/main.py` — where routers are registered

---

## Key Files to Read Before Starting

- `src/sv_site/models.py` — add `CustomerFeedback` ORM model here
- `src/sv_site/config.py` — add `feedback_ingest_key` and `anthropic_api_key`
- `src/sv_site/routes/auth.py` — route + dependency pattern to mirror
- `src/sv_site/main.py` — router registration
- `requirements.txt` — add `anthropic>=0.40.0`

---

## New Dependency

Add to `requirements.txt`:
```
anthropic>=0.40.0
```

---

## Database Setup

The Hub does not use Alembic. Run this SQL directly against the Hub's PostgreSQL
database (dev and prod separately):

```sql
CREATE TABLE IF NOT EXISTS shadowedvaca.customer_feedback (
    id                    SERIAL PRIMARY KEY,
    program_name          VARCHAR(80)  NOT NULL,
    received_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- De-identified context; no contact_info column
    is_authenticated_user BOOLEAN      NOT NULL DEFAULT FALSE,
    is_anonymous          BOOLEAN      NOT NULL DEFAULT FALSE,
    privacy_token         VARCHAR(64),

    -- Raw inputs
    score                 INTEGER      CHECK (score BETWEEN 1 AND 10),
    raw_feedback          TEXT         NOT NULL,

    -- AI-enriched fields (NULL until processed)
    summary               TEXT,
    sentiment             VARCHAR(20),
    tags                  JSONB,
    processed_at          TIMESTAMPTZ,
    processing_error      TEXT
);

CREATE INDEX IF NOT EXISTS idx_cf_program
    ON shadowedvaca.customer_feedback (program_name);
CREATE INDEX IF NOT EXISTS idx_cf_received
    ON shadowedvaca.customer_feedback (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_cf_sentiment
    ON shadowedvaca.customer_feedback (sentiment);
CREATE INDEX IF NOT EXISTS idx_cf_tags
    ON shadowedvaca.customer_feedback USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_cf_token
    ON shadowedvaca.customer_feedback (privacy_token)
    WHERE privacy_token IS NOT NULL;
```

Save this as `scripts/migrations/add_customer_feedback.sql` in the repo for
documentation and repeatability.

---

## ORM Model

Add to `src/sv_site/models.py`:

```python
from sqlalchemy import Boolean, CheckConstraint, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional
from datetime import datetime


class CustomerFeedback(Base):
    __tablename__ = "customer_feedback"
    __table_args__ = (
        CheckConstraint("score BETWEEN 1 AND 10", name="ck_cf_score"),
        {"schema": "shadowedvaca"},
    )

    id:                    Mapped[int]             = mapped_column(Integer, primary_key=True)
    program_name:          Mapped[str]             = mapped_column(String(80), nullable=False)
    received_at:           Mapped[datetime]        = mapped_column(
                               TIMESTAMP(timezone=True), server_default="NOW()"
                           )
    is_authenticated_user: Mapped[bool]            = mapped_column(Boolean, default=False)
    is_anonymous:          Mapped[bool]            = mapped_column(Boolean, default=False)
    privacy_token:         Mapped[Optional[str]]   = mapped_column(String(64))
    score:                 Mapped[Optional[int]]   = mapped_column(Integer)
    raw_feedback:          Mapped[str]             = mapped_column(Text, nullable=False)
    summary:               Mapped[Optional[str]]   = mapped_column(Text)
    sentiment:             Mapped[Optional[str]]   = mapped_column(String(20))
    tags:                  Mapped[Optional[dict]]  = mapped_column(JSONB)
    processed_at:          Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    processing_error:      Mapped[Optional[str]]   = mapped_column(Text)
```

---

## Config Settings

Add to `src/sv_site/config.py` `Settings` class:

```python
feedback_ingest_key: str = ""    # clients must send this header to POST /api/feedback/ingest
anthropic_api_key: str = ""      # for AI processing; empty = skip AI gracefully
```

Add to server `.env`:
```
FEEDBACK_INGEST_KEY=<generate 32+ byte random string>
ANTHROPIC_API_KEY=<your Anthropic API key>
```

---

## AI Processor

**File:** `src/sv_site/feedback_processor.py` (new file)

```python
"""
AI processing for customer feedback using Claude Haiku.
Called synchronously from the ingest endpoint.
Degrades gracefully when ANTHROPIC_API_KEY is absent or call fails.
"""
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_VALID_TAGS = {
    "new feature request", "bug report", "praise", "improvement suggestion",
    "missing content", "performance issue", "ui/ux", "documentation",
    "confusing/unclear", "other",
}
_VALID_SENTIMENTS = {"positive", "neutral", "negative", "mixed"}

_SYSTEM_PROMPT = """\
You are a feedback analyst. Given raw user feedback about a software product, extract
structured information and return ONLY a valid JSON object — no markdown, no code fences.

Fields:
- summary (string): 1–3 neutral, factual sentences summarizing the feedback
- sentiment (string): exactly one of: "positive", "neutral", "negative", "mixed"
- tags (array): 1–4 tags chosen ONLY from this list:
    "new feature request", "bug report", "praise", "improvement suggestion",
    "missing content", "performance issue", "ui/ux", "documentation",
    "confusing/unclear", "other"

Return format: {"summary": "...", "sentiment": "...", "tags": ["..."]}
"""


async def process_feedback(
    raw_feedback: str,
    score: Optional[int],
    program_name: str,
    api_key: str,
) -> dict:
    """
    Returns dict with keys: summary, sentiment, tags, error.
    All content fields may be None if processing fails.
    """
    if not api_key:
        return {"summary": None, "sentiment": None, "tags": None,
                "error": "ANTHROPIC_API_KEY not configured"}

    try:
        import anthropic

        user_content = (
            f"Program: {program_name}\n"
            f"Score: {score}/10\n"
            f"Feedback:\n{raw_feedback}"
        )

        client = anthropic.AsyncAnthropic(api_key=api_key)
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )

        parsed = json.loads(message.content[0].text.strip())

        summary = parsed.get("summary") or None
        raw_sentiment = parsed.get("sentiment", "").lower()
        sentiment = raw_sentiment if raw_sentiment in _VALID_SENTIMENTS else "neutral"
        raw_tags = parsed.get("tags") or []
        tags = [t for t in raw_tags if t in _VALID_TAGS]

        return {"summary": summary, "sentiment": sentiment, "tags": tags, "error": None}

    except ImportError:
        logger.error("anthropic package not installed")
        return {"summary": None, "sentiment": None, "tags": None,
                "error": "anthropic package not installed"}
    except Exception as exc:
        logger.error("Feedback AI processing failed: %s", exc)
        return {"summary": None, "sentiment": None, "tags": None, "error": str(exc)}
```

---

## Ingest Endpoint

**File:** `src/sv_site/routes/feedback_ingest.py` (new file)

```python
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

from sv_site.config import get_settings
from sv_site.database import get_db
from sv_site.models import CustomerFeedback
from sv_site.feedback_processor import process_feedback

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/feedback", tags=["feedback"])


class IngestPayload(BaseModel):
    program_name:          str  = Field(..., min_length=1, max_length=80)
    score:                 int  = Field(..., ge=1, le=10)
    raw_feedback:          str  = Field(..., min_length=1, max_length=10000)
    is_authenticated_user: bool = False
    is_anonymous:          bool = False
    privacy_token:         Optional[str] = Field(None, max_length=64)


async def _require_ingest_key(x_ingest_key: str = Header(default="")) -> None:
    settings = get_settings()
    expected = settings.feedback_ingest_key
    if not expected or x_ingest_key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Ingest-Key")


@router.post("/ingest")
async def ingest_feedback(
    payload: IngestPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_ingest_key),
):
    """
    Receive a de-identified feedback payload from a client app.
    Stores the record, runs AI processing, returns hub_feedback_id.
    """
    settings = get_settings()

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
        api_key=settings.anthropic_api_key,
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
```

**Register in `src/sv_site/main.py`:**
```python
from sv_site.routes.feedback_ingest import router as feedback_ingest_router
app.include_router(feedback_ingest_router)
```

---

## Tests

**File:** `tests/test_feedback_ingest.py` (follow existing test file patterns)

### `test_ingest_requires_key`
- POST to `/api/feedback/ingest` with no header → 401
- POST with wrong key → 401

### `test_ingest_valid_payload`
- POST with correct key and valid body:
  `{"program_name": "test-app", "score": 8, "raw_feedback": "Really useful tool!"}`
- Mock `process_feedback` to return `{summary: "...", sentiment: "positive", tags: ["praise"], error: None}`
- Assert 200, response contains `hub_feedback_id` (integer > 0)
- Assert DB record created with correct fields

### `test_ingest_anonymous_clears_token`
- POST with `is_anonymous=True, privacy_token="abc123"`
- Assert DB record has `privacy_token=NULL`

### `test_ingest_ai_degraded`
- Mock `process_feedback` to return `{summary: None, sentiment: None, tags: None, error: "API key not configured"}`
- Assert 200 still returned (record saved even if AI fails)
- Assert DB record has `processing_error` set, `processed_at=NULL`

### `test_ingest_invalid_score`
- POST with `score=0` or `score=11` → 422

### `test_ingest_empty_feedback`
- POST with `raw_feedback=""` → 422

### `test_process_feedback_filters_invalid_tags`
- Mock Claude response includes invalid tag `"nice"` alongside valid `"praise"`
- Assert only `["praise"]` returned

### `test_process_feedback_unknown_sentiment_defaults_neutral`
- Mock Claude response has `"sentiment": "pretty good"`
- Assert returned sentiment is `"neutral"`

### `test_process_feedback_no_api_key`
- Call `process_feedback(..., api_key="")`
- Assert returns all-None content fields, `error` is non-empty string

---

## Deliverables Checklist

- [ ] `requirements.txt` — `anthropic>=0.40.0` added
- [ ] `scripts/migrations/add_customer_feedback.sql` — SQL to create table + indexes
- [ ] Table created in dev DB (run the SQL)
- [ ] `src/sv_site/models.py` — `CustomerFeedback` ORM model added
- [ ] `src/sv_site/config.py` — `feedback_ingest_key`, `anthropic_api_key` added
- [ ] `src/sv_site/feedback_processor.py` — AI processing with graceful degradation
- [ ] `src/sv_site/routes/feedback_ingest.py` — `POST /api/feedback/ingest`
- [ ] `src/sv_site/main.py` — router registered
- [ ] Server `.env` — `FEEDBACK_INGEST_KEY` and `ANTHROPIC_API_KEY` set
- [ ] `tests/test_feedback_ingest.py` — all tests pass
- [ ] Manual smoke test: `curl -X POST .../api/feedback/ingest -H "X-Ingest-Key: ..." -d '{...}'`
  returns `{"ok": true, "hub_feedback_id": 1}`

---

## What This Phase Does NOT Do

- No display UI (Phase F.4)
- No admin read API (Phase F.4)
- No Hub tool card (Phase F.4)
- Client apps (PATT, podcast) are not yet wired up (Phases F.2, F.3)
