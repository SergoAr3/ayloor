"""Playwright-only localhost server with synthetic credentials and a dedicated *_test DB."""

import asyncio
import os
import sys

from app.core.test_database import DatabaseTestSettings, validate_test_database
from prepare_test_db import ROOT
from prepare_test_db import main as prepare_database


async def prepare() -> None:
    # Capture the application target before changing any environment. Importing
    # app.seed below creates an engine, so even that import must follow the guard.
    settings = DatabaseTestSettings(_env_file=(ROOT / ".env.example", ROOT / ".env"))
    safe_url = validate_test_database(settings.database_url, settings.test_database_url)
    # Never use a real bot token or application signing key in this local browser harness.
    overrides = {
        "ENVIRONMENT": "development",
        "TELEGRAM_BOT_TOKEN": "123456789:local-browser-test-token",
        "TELEGRAM_BOT_USERNAME": "ayloor_local_test_bot",
        "APP_SECRET_KEY": "local-browser-test-key-0123456789-abcdefghijklmnopqrstuvwxyz",
        "ADMIN_TELEGRAM_IDS": "",
        "CORS_ORIGINS": "http://127.0.0.1:5174",
        "TEST_DATABASE_URL": safe_url,
        "DATABASE_URL": settings.database_url,
    }
    # Match Settings' case-insensitive environment handling when installing
    # synthetic configuration, including the later switch to the validated DB.
    for key in list(os.environ):
        if key.upper() in overrides:
            del os.environ[key]
    os.environ.update(overrides)
    await prepare_database()
    os.environ["DATABASE_URL"] = safe_url
    from app.seed import main as seed_database

    await seed_database()


if __name__ == "__main__":
    asyncio.run(prepare())
    os.execv(
        sys.executable,
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8001",
        ],
    )
