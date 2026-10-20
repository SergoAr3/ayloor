"""Create a dedicated *_test PostgreSQL DB and apply migrations; never truncates data."""

import asyncio
import os
import sys

import asyncpg
from app.core.config import ROOT
from app.core.test_database import DatabaseTestSettings, validate_test_database
from dotenv import dotenv_values
from sqlalchemy.engine import make_url


async def main() -> None:
    # Keep the existing tooling-only .env.example fallback, with the same
    # environment > .env precedence as application Settings. Validate before
    # connecting, executing SQL or launching the Alembic subprocess.
    settings = DatabaseTestSettings(_env_file=(ROOT / ".env.example", ROOT / ".env"))
    safe_url = validate_test_database(settings.database_url, settings.test_database_url)
    url = make_url(safe_url)
    config = {
        **dotenv_values(ROOT / ".env.example"),
        **dotenv_values(ROOT / ".env"),
        **os.environ,
    }
    admin_url = url.set(drivername="postgresql", database="postgres")
    connection = await asyncpg.connect(admin_url.render_as_string(hide_password=False))
    try:
        if not await connection.fetchval(
            "SELECT 1 FROM pg_database WHERE datname=$1", url.database
        ):
            identifier = '"' + url.database.replace('"', '""') + '"'
            await connection.execute(f"CREATE DATABASE {identifier}")
    finally:
        await connection.close()
    env = {
        # Settings is case-insensitive: remove aliases before installing the
        # validated target, so a lowercase database_url cannot win in the child.
        **{
            key: value
            for key, value in config.items()
            if key.lower() not in {"database_url", "environment"}
        },
        "DATABASE_URL": url.render_as_string(hide_password=False),
        "ENVIRONMENT": "test",
    }
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "alembic",
        "-c",
        str(ROOT / "backend/alembic.ini"),
        "upgrade",
        "head",
        env=env,
    )
    if await process.wait() != 0:
        raise SystemExit("Test database migration failed")
    print(
        "Dedicated test database migrated. Tests will truncate only this *_test database."
    )


if __name__ == "__main__":
    asyncio.run(main())
