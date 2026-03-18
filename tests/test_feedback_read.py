"""Tests for GET /api/hub/feedback and GET /api/hub/feedback/programs."""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone

from httpx import ASGITransport, AsyncClient

from sv_site.auth import create_access_token
from sv_site.database import get_db
from sv_site.main import app
from sv_site.models import CustomerFeedback


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_jwt(is_admin: bool = False) -> str:
    """Create a real signed JWT using the app's actual secret key."""
    return create_access_token(user_id=1, username="testuser", is_admin=is_admin)


def make_record(**kwargs) -> CustomerFeedback:
    defaults = {
        "id": 1,
        "program_name": "test-app",
        "received_at": datetime(2026, 3, 10, 12, 0, 0, tzinfo=timezone.utc),
        "is_authenticated_user": False,
        "is_anonymous": False,
        "privacy_token": None,
        "score": 8,
        "raw_feedback": "Great tool!",
        "summary": "User found the tool useful.",
        "sentiment": "positive",
        "tags": ["praise"],
        "processed_at": datetime(2026, 3, 10, 12, 0, 1, tzinfo=timezone.utc),
        "processing_error": None,
    }
    defaults.update(kwargs)
    rec = CustomerFeedback()
    for k, v in defaults.items():
        setattr(rec, k, v)
    return rec


@pytest_asyncio.fixture
async def admin_client():
    """AsyncClient with admin JWT and mocked DB."""
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()

    app.dependency_overrides[get_db] = lambda: db

    token = make_jwt(is_admin=True)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        client.headers.update({"Authorization": f"Bearer {token}"})
        client._test_db = db
        yield client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def user_client():
    """AsyncClient with non-admin JWT."""
    db = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db

    token = make_jwt(is_admin=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        client.headers.update({"Authorization": f"Bearer {token}"})
        yield client

    app.dependency_overrides.clear()


def _mock_execute(records=None, total=None):
    """Build a mock db.execute that returns appropriate results."""

    async def execute(query):
        result = MagicMock()
        # Count query (scalar_one)
        if total is not None and hasattr(result, 'scalar_one'):
            result.scalar_one = MagicMock(return_value=total)
        result.scalar_one = MagicMock(return_value=total if total is not None else 0)
        # Rows query (scalars().all())
        scalars_mock = MagicMock()
        scalars_mock.all = MagicMock(return_value=records if records is not None else [])
        result.scalars = MagicMock(return_value=scalars_mock)
        return result

    return execute


# ---------------------------------------------------------------------------
# Auth tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_feedback_read_requires_admin(user_client):
    """Non-admin JWT → 403."""
    resp = await user_client.get("/api/hub/feedback")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_feedback_read_no_auth():
    """No JWT → 401."""
    db = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/hub/feedback")
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_programs_requires_admin(user_client):
    """Non-admin JWT → 403 on programs endpoint."""
    resp = await user_client.get("/api/hub/feedback/programs")
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Basic read tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_feedback_read_returns_records(admin_client):
    """Seed two records — GET returns total=2, both records present."""
    rec1 = make_record(id=1, received_at=datetime(2026, 3, 10, 12, 0, 0, tzinfo=timezone.utc))
    rec2 = make_record(id=2, received_at=datetime(2026, 3, 9, 12, 0, 0, tzinfo=timezone.utc))

    call_count = [0]

    async def execute(query):
        result = MagicMock()
        call_count[0] += 1
        if call_count[0] == 1:
            # count query
            result.scalar_one = MagicMock(return_value=2)
            scalars_mock = MagicMock()
            scalars_mock.all = MagicMock(return_value=[])
            result.scalars = MagicMock(return_value=scalars_mock)
        else:
            # data query — newest first
            result.scalar_one = MagicMock(return_value=2)
            scalars_mock = MagicMock()
            scalars_mock.all = MagicMock(return_value=[rec1, rec2])
            result.scalars = MagicMock(return_value=scalars_mock)
        return result

    admin_client._test_db.execute = execute

    resp = await admin_client.get("/api/hub/feedback")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["data"]["total"] == 2
    assert len(body["data"]["feedback"]) == 2
    # Newest first: rec1 (Mar 10) before rec2 (Mar 9)
    assert body["data"]["feedback"][0]["id"] == 1
    assert body["data"]["feedback"][1]["id"] == 2


# ---------------------------------------------------------------------------
# Filter tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_feedback_read_program_filter(admin_client):
    """?program_name= returns only matching records."""
    rec = make_record(id=1, program_name="patt-guild-portal")

    call_count = [0]

    async def execute(query):
        result = MagicMock()
        call_count[0] += 1
        if call_count[0] == 1:
            result.scalar_one = MagicMock(return_value=1)
            result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        else:
            result.scalar_one = MagicMock(return_value=1)
            result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[rec])))
        return result

    admin_client._test_db.execute = execute

    resp = await admin_client.get("/api/hub/feedback?program_name=patt-guild-portal")
    assert resp.status_code == 200
    feedback = resp.json()["data"]["feedback"]
    assert len(feedback) == 1
    assert feedback[0]["program_name"] == "patt-guild-portal"


@pytest.mark.asyncio
async def test_feedback_read_sentiment_filter(admin_client):
    """?sentiment=positive returns only positive records."""
    rec = make_record(id=1, sentiment="positive")

    call_count = [0]

    async def execute(query):
        result = MagicMock()
        call_count[0] += 1
        if call_count[0] == 1:
            result.scalar_one = MagicMock(return_value=1)
            result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        else:
            result.scalar_one = MagicMock(return_value=1)
            result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[rec])))
        return result

    admin_client._test_db.execute = execute

    resp = await admin_client.get("/api/hub/feedback?sentiment=positive")
    assert resp.status_code == 200
    feedback = resp.json()["data"]["feedback"]
    assert len(feedback) == 1
    assert feedback[0]["sentiment"] == "positive"


@pytest.mark.asyncio
async def test_feedback_read_tag_filter_match(admin_client):
    """?tag=praise — record with tags=["praise","ui/ux"] is included."""
    rec = make_record(id=1, tags=["praise", "ui/ux"])

    call_count = [0]

    async def execute(query):
        result = MagicMock()
        call_count[0] += 1
        if call_count[0] == 1:
            result.scalar_one = MagicMock(return_value=1)
            result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        else:
            result.scalar_one = MagicMock(return_value=1)
            result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[rec])))
        return result

    admin_client._test_db.execute = execute

    resp = await admin_client.get("/api/hub/feedback?tag=praise")
    assert resp.status_code == 200
    assert len(resp.json()["data"]["feedback"]) == 1


@pytest.mark.asyncio
async def test_feedback_read_score_filter(admin_client):
    """?min_score=8 — only high-score records returned."""
    rec = make_record(id=1, score=9)

    call_count = [0]

    async def execute(query):
        result = MagicMock()
        call_count[0] += 1
        if call_count[0] == 1:
            result.scalar_one = MagicMock(return_value=1)
            result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        else:
            result.scalar_one = MagicMock(return_value=1)
            result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[rec])))
        return result

    admin_client._test_db.execute = execute

    resp = await admin_client.get("/api/hub/feedback?min_score=8")
    assert resp.status_code == 200
    assert resp.json()["data"]["feedback"][0]["score"] == 9


# ---------------------------------------------------------------------------
# Privacy token truncation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_privacy_token_truncated_in_response(admin_client):
    """Full 64-char token is truncated to 8 chars + ellipsis in API response."""
    full_token = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    rec = make_record(id=1, privacy_token=full_token)

    call_count = [0]

    async def execute(query):
        result = MagicMock()
        call_count[0] += 1
        if call_count[0] == 1:
            result.scalar_one = MagicMock(return_value=1)
            result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        else:
            result.scalar_one = MagicMock(return_value=1)
            result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[rec])))
        return result

    admin_client._test_db.execute = execute

    resp = await admin_client.get("/api/hub/feedback")
    assert resp.status_code == 200
    token_field = resp.json()["data"]["feedback"][0]["privacy_token"]
    assert token_field == "abcdef12\u2026"
    assert full_token not in token_field


# ---------------------------------------------------------------------------
# Programs endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_programs_endpoint_returns_distinct(admin_client):
    """Programs endpoint returns sorted distinct program names."""
    async def execute(query):
        result = MagicMock()
        result.scalars = MagicMock(
            return_value=MagicMock(
                all=MagicMock(return_value=["salt-podcast", "patt-guild-portal"])
            )
        )
        return result

    admin_client._test_db.execute = execute

    resp = await admin_client.get("/api/hub/feedback/programs")
    assert resp.status_code == 200
    programs = resp.json()["data"]["programs"]
    assert programs == ["patt-guild-portal", "salt-podcast"]  # sorted
