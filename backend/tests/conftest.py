import hashlib
import hmac
import json
import os
import time
from urllib.parse import urlencode

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.test_database import DatabaseTestSettings, validate_test_database

# Capture the real application URL before any test environment override. This
# guard also runs when collecting only unit tests, before importing app sessions.
database_settings = DatabaseTestSettings()
TEST_URL = validate_test_database(
    database_settings.database_url, database_settings.test_database_url
)

# Test secrets are deliberately unrelated to any developer's .env values.
overrides = {
    "ENVIRONMENT": "test",
    "TELEGRAM_BOT_TOKEN": "123456789:test-only-token",
    "APP_SECRET_KEY": "test-only-key-0123456789-abcdefghijklmnopqrstuvwxyz",
    "ADMIN_TELEGRAM_IDS": "900001",
    "TELEGRAM_BOT_USERNAME": "ayloor_test_bot",
    "DATABASE_URL": TEST_URL,
}
# Settings is case-insensitive; an existing lowercase alias must not override
# the validated test target (or synthetic credentials) during application import.
for key in list(os.environ):
    if key.upper() in overrides:
        del os.environ[key]
os.environ.update(overrides)

from app.db import session as session_module
from app.main import app
from app.seed import seed


def signed_init_data(telegram_id: int, *, auth_date: int | None = None, **extra) -> str:
    data = {
        "auth_date": str(auth_date if auth_date is not None else int(time.time())),
        "query_id": f"test-{telegram_id}",
        "user": json.dumps(
            {"id": telegram_id, "first_name": f"Player {telegram_id}"}, separators=(",", ":")
        ),
        **extra,
    }
    check = "\n".join(f"{key}={value}" for key, value in sorted(data.items()))
    secret = hmac.new(
        b"WebAppData", os.environ["TELEGRAM_BOT_TOKEN"].encode(), hashlib.sha256
    ).digest()
    data["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(data)


@pytest_asyncio.fixture
async def database(monkeypatch):
    # No connection/SQL can precede this check, including if the target changes
    # after collection. The application URL is the original, captured value.
    safe_url = validate_test_database(database_settings.database_url, TEST_URL)
    engine = create_async_engine(safe_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        # Schema must come from Alembic, so tests exercise the real migration constraints/triggers.
        revision = await connection.scalar(text("SELECT version_num FROM alembic_version"))
        assert revision == "0002", "Run migrations on the dedicated test database first"
        await connection.execute(
            text(
                "TRUNCATE submissions, score_events, quest_runs, invites, team_members, "
                "teams, quests, seasons, users, cities CASCADE"
            )
        )
    async with factory.begin() as db:
        await seed(db, development=True)

    # Keep the real request transaction/commit/error handler; replace only its connection factory.
    monkeypatch.setattr(session_module, "SessionFactory", factory)
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
async def client(database):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest.fixture
def login(client):
    async def authenticate(telegram_id: int) -> dict[str, str]:
        result = await client.post(
            "/api/v1/auth/telegram", json={"init_data": signed_init_data(telegram_id)}
        )
        assert result.status_code == 200, result.text
        return {"Authorization": f"Bearer {result.json()['access_token']}"}

    return authenticate


@pytest.fixture
def active_team(client, login):
    async def create(first: int = 1, second: int = 2, name: str = "Kentron Mafia"):
        captain, member = await login(first), await login(second)
        created = await client.post("/api/v1/teams", headers=captain, json={"name": name})
        assert created.status_code == 201, created.text
        team = created.json()
        invite = await client.post(f"/api/v1/teams/{team['id']}/invites", headers=captain, json={})
        assert invite.status_code == 201, invite.text
        code = invite.json()["code"]
        joined = await client.post(f"/api/v1/invites/{code}/join", headers=member)
        assert joined.status_code == 200, joined.text
        return captain, member, joined.json(), code

    return create
