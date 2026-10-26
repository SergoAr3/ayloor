from functools import lru_cache
from ipaddress import ip_address
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


def public_https_origin(value: str) -> str:
    """Validate trusted deployment configuration without echoing its contents."""
    try:
        parsed = urlsplit(value)
        host = (parsed.hostname or "").rstrip(".").lower()
        port = parsed.port
    except ValueError:
        raise ValueError("Set a valid public HTTPS Mini App URL") from None
    if (
        parsed.scheme != "https"
        or not host
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or any(character.isspace() for character in value)
        or host == "localhost"
        or host.endswith((".localhost", ".railway.internal"))
    ):
        raise ValueError("Set a public HTTPS Mini App URL without credentials or fragment")
    try:
        address = ip_address(host)
    except ValueError:
        pass
    else:
        if not address.is_global:
            raise ValueError("Mini App URL must be public")
    authority = f"[{host}]" if ":" in host else host
    return f"https://{authority}" + (f":{port}" if port and port != 443 else "")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT / ".env", extra="ignore", hide_input_in_errors=True
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ):
        def local_dotenv():
            environment = init_settings().get("environment") or env_settings().get("environment")
            if environment == "production":
                return {}
            values = dotenv_settings()
            return (
                values
                if (environment or values.get("environment")) in {"development", "test"}
                else {}
            )

        return init_settings, env_settings, local_dotenv

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

    @field_validator("database_url", mode="before")
    @classmethod
    def asyncpg_url(cls, value: str) -> str:
        # Railway's private DATABASE_URL is a normal PostgreSQL URL.
        for scheme in ("postgresql://", "postgres://"):
            if value.startswith(scheme):
                return "postgresql+asyncpg://" + value[len(scheme) :]
        return value

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
            frontend_origin = public_https_origin(self.telegram_webapp_url)
            if self.allowed_origins != [frontend_origin]:
                raise ValueError("Production CORS_ORIGINS must equal the Mini App HTTPS origin")
            if not self.telegram_bot_username.strip():
                raise ValueError("Set TELEGRAM_BOT_USERNAME for production invite links")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
