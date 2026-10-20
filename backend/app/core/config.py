from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "production"
    database_url: str
    telegram_bot_token: SecretStr = Field(min_length=1)
    telegram_bot_username: str = ""
    telegram_webapp_url: str = ""
    telegram_webhook_secret: SecretStr = SecretStr("")
    app_secret_key: SecretStr = Field(min_length=32)
    jwt_expiration_minutes: int = Field(default=60, ge=1, le=1440)
    telegram_init_data_max_age_seconds: int = Field(default=3600, ge=1, le=86400)
    max_acceptable_gps_accuracy_m: float = Field(default=150, gt=0, allow_inf_nan=False)
    admin_telegram_ids: str = ""
    cors_origins: str = "http://localhost:5173"

    @property
    def admin_ids(self) -> frozenset[int]:
        return frozenset(
            int(value.strip()) for value in self.admin_telegram_ids.split(",") if value.strip()
        )

    @property
    def allowed_origins(self) -> list[str]:
        return [
            value.strip().rstrip("/") for value in self.cors_origins.split(",") if value.strip()
        ]

    @model_validator(mode="after")
    def validate_settings(self) -> "Settings":
        if not self.database_url.startswith("postgresql+asyncpg://"):
            raise ValueError("DATABASE_URL must use postgresql+asyncpg://")
        if any(value <= 0 for value in self.admin_ids):
            raise ValueError("ADMIN_TELEGRAM_IDS must contain positive Telegram IDs")
        if self.environment == "production":
            if "replace" in self.app_secret_key.get_secret_value().lower():
                raise ValueError("Set a random APP_SECRET_KEY for production")
            if "replace" in self.telegram_bot_token.get_secret_value().lower():
                raise ValueError("Set TELEGRAM_BOT_TOKEN for production")
            if not self.telegram_webapp_url.startswith("https://"):
                raise ValueError("Production TELEGRAM_WEBAPP_URL requires HTTPS")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
