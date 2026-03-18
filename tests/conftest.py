"""Shared test fixtures for sv_site tests."""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from httpx import ASGITransport, AsyncClient

from sv_site.config import Settings, get_settings
from sv_site.database import get_db
from sv_site.main import app


TEST_INGEST_KEY = "test-ingest-key-32-bytes-minimum!!"


def make_test_settings(**overrides):
    return Settings(
        database_url="postgresql+asyncpg://localhost/test",
        secret_key="test-secret-key",
        environment="test",
        feedback_ingest_key=TEST_INGEST_KEY,
        anthropic_api_key="test-anthropic-key",
        **overrides,
    )


@pytest.fixture
def test_settings():
    return make_test_settings()


@pytest_asyncio.fixture
async def mock_db():
    """AsyncMock that mimics an AsyncSession."""
    db = AsyncMock()
    db.add = MagicMock()      # add() is sync
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()

    # Simulate flush assigning an id to the record
    async def fake_flush():
        # Find the CustomerFeedback object passed to db.add and set its id
        if db.add.call_args:
            record = db.add.call_args[0][0]
            record.id = 42

    db.flush.side_effect = fake_flush
    return db


@pytest_asyncio.fixture
async def async_client(mock_db, test_settings):
    """FastAPI test client with overridden dependencies."""
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_settings] = lambda: test_settings

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client

    app.dependency_overrides.clear()
