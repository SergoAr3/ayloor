import os

import pytest
from ayloor_bot.config import BotSettings
from pydantic import ValidationError


@pytest.fixture
def clean_settings_env(monkeypatch):
    for key in list(os.environ):
        if key.lower() in BotSettings.model_fields:
            monkeypatch.delenv(key)


def test_production_requires_environment_secrets(tmp_path, clean_settings_env, monkeypatch):
    env = tmp_path / ".env"
    env.write_text(
        "ENVIRONMENT=development\n"
        "TELEGRAM_BOT_TOKEN=123456:dotenv-only-token\n"
        "TELEGRAM_WEBAPP_URL=https://miniapp.example.org\n"
    )
    monkeypatch.setenv("ENVIRONMENT", "production")
    with pytest.raises(ValidationError):
        BotSettings(_env_file=env)
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123456:environment-only-token")
    monkeypatch.setenv("TELEGRAM_WEBAPP_URL", "https://miniapp.example.org")
    settings = BotSettings(_env_file=env)
    assert settings.telegram_bot_token.get_secret_value() == "123456:environment-only-token"


def test_local_development_keeps_dotenv_handoff(tmp_path, clean_settings_env):
    env = tmp_path / ".env"
    env.write_text(
        "ENVIRONMENT=development\n"
        "TELEGRAM_BOT_TOKEN=123456:dotenv-only-token\n"
        "TELEGRAM_WEBAPP_URL=https://miniapp.example.org\n"
    )
    assert BotSettings(_env_file=env).environment == "development"


@pytest.mark.parametrize(
    "url",
    [
        "http://miniapp.example.org",
        "https://localhost",
        "https://127.0.0.1",
        "https://[::1]",
        "https://frontend.railway.internal",
        "https://user:password@miniapp.example.org",
    ],
)
def test_production_rejects_nonpublic_webapp_url(url, clean_settings_env):
    with pytest.raises(ValidationError):
        BotSettings(
            environment="production",
            telegram_bot_token="123456:synthetic-token",
            telegram_webapp_url=url,
            _env_file=None,
        )
