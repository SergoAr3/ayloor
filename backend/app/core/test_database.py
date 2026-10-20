"""Shared, connection-free safety checks for pytest and browser/test tooling."""

from urllib.parse import parse_qsl, urlsplit

from pydantic_settings import BaseSettings
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from app.core.config import Settings


class DatabaseTestSettings(BaseSettings):
    # Reuse the application's dotenv path and environment precedence/case handling.
    model_config = Settings.model_config

    database_url: str | None = None
    test_database_url: str = (
        "postgresql+asyncpg://ayloor:ayloor-local-only@localhost:5432/ayloor_test"
    )


def validate_test_database(application_url: str | None, test_url: str) -> str:
    try:
        target = make_url(test_url)
        application = make_url(application_url) if application_url is not None else None
        # SQLAlchemy drops blank query values. Inspect the raw query too, so
        # even ?database= is rejected rather than silently accepted.
        raw_query_keys = {
            name: {key.lower() for key, _ in parse_qsl(urlsplit(raw).query, keep_blank_values=True)}
            for name, raw in (("TEST_DATABASE_URL", test_url), ("DATABASE_URL", application_url))
            if raw is not None
        }
    except (ArgumentError, ValueError):
        raise RuntimeError(
            "Application and test database URLs must be valid SQLAlchemy URLs"
        ) from None

    if target.drivername != "postgresql+asyncpg":
        raise RuntimeError("TEST_DATABASE_URL must use postgresql+asyncpg://")
    if not target.database or not target.database.endswith("_test"):
        raise RuntimeError(
            "TEST_DATABASE_URL database name must end in _test (tests truncate its tables)"
        )
    # SQLAlchemy passes query arguments to asyncpg as connection kwargs. Reject
    # database selectors/DSNs rather than guessing precedence between URL forms.
    for name, url in (("TEST_DATABASE_URL", target), ("DATABASE_URL", application)):
        if url is not None and (raw_query_keys[name] | {key.lower() for key in url.query}) & {
            "database",
            "dbname",
            "dsn",
        }:
            raise RuntimeError(f"{name} must not override its database in query parameters")
    if application is not None:
        if not application.database:
            raise RuntimeError("Application DATABASE_URL must explicitly identify its database")
        # Keep the existing conservative rule: different names are required even
        # across hosts/ports/credentials, so aliases cannot weaken isolation. This
        # also rejects every identical server/database target, regardless of user.
        if target.database == application.database:
            raise RuntimeError(
                "Test database must differ from the effective application database; "
                "DATABASE_URL and TEST_DATABASE_URL select the same database"
            )
    return test_url
