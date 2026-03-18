"""Tests for POST /api/feedback/ingest and the AI processor."""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from httpx import ASGITransport, AsyncClient

from sv_site.config import Settings, get_settings
from sv_site.database import get_db
from sv_site.main import app

from tests.conftest import TEST_INGEST_KEY, make_test_settings

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_PAYLOAD = {
    "program_name": "test-app",
    "score": 8,
    "raw_feedback": "Really useful tool!",
}

AI_OK = {"summary": "User found the tool useful.", "sentiment": "positive",
         "tags": ["praise"], "error": None}

AI_DEGRADED = {"summary": None, "sentiment": None, "tags": None,
               "error": "API key not configured"}


# ---------------------------------------------------------------------------
# Ingest endpoint — auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ingest_requires_key(async_client):
    """Missing or wrong X-Ingest-Key returns 401."""
    resp = await async_client.post("/api/feedback/ingest", json=VALID_PAYLOAD)
    assert resp.status_code == 401

    resp = await async_client.post(
        "/api/feedback/ingest",
        json=VALID_PAYLOAD,
        headers={"X-Ingest-Key": "wrong-key"},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Ingest endpoint — happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ingest_valid_payload(async_client, mock_db):
    """Valid payload with correct key → 200, hub_feedback_id returned, DB record created."""
    with patch("sv_site.routes.feedback_ingest.process_feedback", return_value=AI_OK):
        resp = await async_client.post(
            "/api/feedback/ingest",
            json=VALID_PAYLOAD,
            headers={"X-Ingest-Key": TEST_INGEST_KEY},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert isinstance(body["hub_feedback_id"], int)
    assert body["hub_feedback_id"] > 0

    # DB record was added and committed
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()

    record = mock_db.add.call_args[0][0]
    assert record.program_name == "test-app"
    assert record.score == 8
    assert record.raw_feedback == "Really useful tool!"
    assert record.summary == "User found the tool useful."
    assert record.sentiment == "positive"
    assert record.tags == ["praise"]
    assert record.processed_at is not None
    assert record.processing_error is None


# ---------------------------------------------------------------------------
# Ingest endpoint — privacy enforcement
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ingest_anonymous_clears_token(async_client, mock_db):
    """is_anonymous=True forces privacy_token to NULL regardless of submitted value."""
    payload = {**VALID_PAYLOAD, "is_anonymous": True, "privacy_token": "abc123"}

    with patch("sv_site.routes.feedback_ingest.process_feedback", return_value=AI_OK):
        resp = await async_client.post(
            "/api/feedback/ingest",
            json=payload,
            headers={"X-Ingest-Key": TEST_INGEST_KEY},
        )

    assert resp.status_code == 200
    record = mock_db.add.call_args[0][0]
    assert record.privacy_token is None


# ---------------------------------------------------------------------------
# Ingest endpoint — AI degradation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ingest_ai_degraded(async_client, mock_db):
    """AI failure still returns 200; processing_error set, processed_at NULL."""
    with patch("sv_site.routes.feedback_ingest.process_feedback", return_value=AI_DEGRADED):
        resp = await async_client.post(
            "/api/feedback/ingest",
            json=VALID_PAYLOAD,
            headers={"X-Ingest-Key": TEST_INGEST_KEY},
        )

    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    record = mock_db.add.call_args[0][0]
    assert record.processing_error == "API key not configured"
    assert record.processed_at is None


# ---------------------------------------------------------------------------
# Ingest endpoint — validation errors
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ingest_invalid_score_too_low(async_client):
    """score=0 is rejected with 422."""
    resp = await async_client.post(
        "/api/feedback/ingest",
        json={**VALID_PAYLOAD, "score": 0},
        headers={"X-Ingest-Key": TEST_INGEST_KEY},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_ingest_invalid_score_too_high(async_client):
    """score=11 is rejected with 422."""
    resp = await async_client.post(
        "/api/feedback/ingest",
        json={**VALID_PAYLOAD, "score": 11},
        headers={"X-Ingest-Key": TEST_INGEST_KEY},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_ingest_empty_feedback(async_client):
    """Empty raw_feedback is rejected with 422."""
    resp = await async_client.post(
        "/api/feedback/ingest",
        json={**VALID_PAYLOAD, "raw_feedback": ""},
        headers={"X-Ingest-Key": TEST_INGEST_KEY},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# AI processor — unit tests (no HTTP)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_process_feedback_no_api_key():
    """Empty api_key skips AI and returns error."""
    from sv_site.feedback_processor import process_feedback

    result = await process_feedback(
        raw_feedback="Great tool!",
        score=9,
        program_name="test-app",
        api_key="",
    )
    assert result["summary"] is None
    assert result["sentiment"] is None
    assert result["tags"] is None
    assert result["error"]  # non-empty string


@pytest.mark.asyncio
async def test_process_feedback_filters_invalid_tags():
    """Claude response containing invalid tags — only valid ones returned."""
    from sv_site.feedback_processor import process_feedback

    mock_message = MagicMock()
    mock_message.content = [
        MagicMock(text='{"summary": "Good.", "sentiment": "positive", "tags": ["praise", "nice"]}')
    ]

    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock(return_value=mock_message)

    with patch("anthropic.AsyncAnthropic", return_value=mock_client):
        result = await process_feedback(
            raw_feedback="Nice tool!",
            score=9,
            program_name="test-app",
            api_key="fake-key",
        )

    assert result["tags"] == ["praise"]
    assert "nice" not in result["tags"]


@pytest.mark.asyncio
async def test_process_feedback_unknown_sentiment_defaults_neutral():
    """Unrecognized sentiment value is coerced to 'neutral'."""
    from sv_site.feedback_processor import process_feedback

    mock_message = MagicMock()
    mock_message.content = [
        MagicMock(text='{"summary": "Okay.", "sentiment": "pretty good", "tags": ["praise"]}')
    ]

    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock(return_value=mock_message)

    with patch("anthropic.AsyncAnthropic", return_value=mock_client):
        result = await process_feedback(
            raw_feedback="Pretty good tool.",
            score=7,
            program_name="test-app",
            api_key="fake-key",
        )

    assert result["sentiment"] == "neutral"
