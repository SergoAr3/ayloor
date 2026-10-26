import os
import runpy

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy.exc import StatementError

from app.core.config import ROOT, Settings
from app.db.session import engine

PRODUCTION = {
    "environment": "production",
    "database_url": "postgresql://user:synthetic-password@postgres.railway.internal:5432/railway",
    "telegram_bot_token": "123456789:synthetic-bot-token",
    "telegram_bot_username": "ayloor_beta_bot",
    "telegram_webapp_url": "https://miniapp.example.org",
    "app_secret_key": "synthetic-jwt-key-0123456789-abcdefghijklmnopqrstuvwxyz",
    "cors_origins": "https://miniapp.example.org",
}


@pytest.fixture
def clean_settings_env(monkeypatch):
    for key in list(os.environ):
        if key.lower() in Settings.model_fields:
            monkeypatch.delenv(key)


@pytest.mark.parametrize("scheme", ["postgresql", "postgres", "postgresql+asyncpg"])
def test_railway_url_keeps_credentials_and_uses_asyncpg(scheme, clean_settings_env):
    settings = Settings(
        **{**PRODUCTION, "database_url": f"{scheme}://u:p%40ss@postgres.railway.internal/db"},
        _env_file=None,
    )
    assert settings.database_url == "postgresql+asyncpg://u:p%40ss@postgres.railway.internal/db"
    assert settings.allowed_origins == ["https://miniapp.example.org"]


@pytest.mark.parametrize(
    "changes",
    [
        {"database_url": "sqlite:///application.db"},
        {"telegram_webapp_url": "http://miniapp.example.org"},
        {"telegram_webapp_url": "https://localhost"},
        {"telegram_webapp_url": "https://127.0.0.1"},
        {"telegram_webapp_url": "https://[::1]"},
        {"telegram_webapp_url": "https://frontend.railway.internal"},
        {"telegram_webapp_url": "https://user:password@miniapp.example.org"},
        {"telegram_webapp_url": "https://miniapp.example.org/#old"},
        {"cors_origins": "http://localhost:5173"},
        {"cors_origins": "*"},
        {"cors_origins": "https://miniapp.example.org,https://other.example.org"},
        {"telegram_bot_username": ""},
        {"app_secret_key": "replace-with-a-real-random-secret-key"},
    ],
)
def test_production_rejects_unsafe_or_mismatched_config(changes, clean_settings_env):
    with pytest.raises(ValidationError):
        Settings(**{**PRODUCTION, **changes}, _env_file=None)


def test_production_does_not_fall_back_to_dotenv_secrets(tmp_path, clean_settings_env, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("\n".join(f"{key.upper()}={value}" for key, value in PRODUCTION.items()))
    monkeypatch.setenv("ENVIRONMENT", "production")
    with pytest.raises(ValidationError) as failure:
        Settings(_env_file=env)
    assert "Field required" in str(failure.value)
    assert "synthetic-password" not in str(failure.value)
    for key, value in PRODUCTION.items():
        monkeypatch.setenv(key.upper(), value)
    assert Settings(_env_file=env).telegram_bot_username == "ayloor_beta_bot"


def test_local_development_still_uses_dotenv(tmp_path, clean_settings_env):
    env = tmp_path / ".env"
    env.write_text(
        "\n".join(
            f"{key.upper()}={value}"
            for key, value in {**PRODUCTION, "environment": "development"}.items()
        )
    )
    assert Settings(_env_file=env).environment == "development"


def test_config_errors_do_not_print_credentials(clean_settings_env):
    with pytest.raises(ValidationError) as failure:
        Settings(**{**PRODUCTION, "cors_origins": "*"}, _env_file=None)
    assert "synthetic-password" not in str(failure.value)
    assert "synthetic-bot-token" not in str(failure.value)


async def test_production_cors_allows_only_exact_frontend_origin(monkeypatch, clean_settings_env):
    settings = Settings(**PRODUCTION, _env_file=None)
    monkeypatch.setattr("app.core.config.get_settings", lambda: settings)
    # Construct the real app with production middleware; preflight never opens a DB session.
    app = runpy.run_path(str(ROOT / "backend/app/main.py"))["app"]
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://api.example.org"
    ) as client:
        for origin, expected in [
            ("https://miniapp.example.org", 200),
            ("https://other.example.org", 400),
        ]:
            response = await client.options(
                "/api/v1/auth/telegram",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "Authorization,Content-Type",
                },
            )
            assert response.status_code == expected
            assert response.headers.get("access-control-allow-origin") == (
                origin if expected == 200 else None
            )


def test_sql_error_formatting_hides_bound_profile_and_gps():
    error = StatementError(
        "synthetic database failure",
        "INSERT INTO submissions VALUES (:latitude, :profile)",
        {"latitude": "synthetic-gps-marker", "profile": "synthetic-profile-marker"},
        None,
        hide_parameters=engine.sync_engine.hide_parameters,
    )
    rendered = str(error)
    assert "INSERT INTO submissions" in rendered
    assert "synthetic database failure" in rendered
    assert "synthetic-gps-marker" not in rendered
    assert "synthetic-profile-marker" not in rendered
