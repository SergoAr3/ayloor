from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class BotSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
    )
    telegram_bot_token: SecretStr
    telegram_webapp_url: str
    environment: Literal["development", "test", "production"] = "production"

    @model_validator(mode="after")
    def valid_url(self) -> "BotSettings":
        parsed = urlsplit(self.telegram_webapp_url)
        if parsed.scheme != "https" or not parsed.netloc or parsed.fragment:
            raise ValueError("TELEGRAM_WEBAPP_URL must be an HTTPS URL without a fragment")
        return self
