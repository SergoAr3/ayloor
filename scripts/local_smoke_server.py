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
    from app.explore_seed import main as seed_explore

    await seed_explore()
    # Separate GPS fixture, installed ONLY after the dedicated test database guard.
    # Never change the existing no-checkpoint demo or publish invented city content.
    from app.db.session import SessionFactory
    from app.models import Guide, GuideStop
    from sqlalchemy import select

    async with SessionFactory.begin() as db:
        if not await db.scalar(
            select(Guide).where(Guide.slug == "explore-arrival-test")
        ):
            guide = Guide(
                slug="explore-arrival-test",
                title="GPS fixture",
                description="Not a real walk",
            )
            db.add(guide)
            await db.flush()
            for position in (1, 2):
                db.add(
                    GuideStop(
                        guide_id=guide.id,
                        position=position,
                        title="Synthetic GPS stop",
                        clue="Synthetic card: say yes.",
                        answer="yes",
                        hint="Say yes.",
                        reveal="Synthetic story.",
                        directions="Synthetic test only. Stay in a safe place; do not travel to these coordinates.",
                        latitude=0,
                        longitude=0,
                        radius_m=100,
                        max_accuracy_m=50,
                    )
                )


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
