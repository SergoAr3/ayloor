from ipaddress import ip_address
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict


class BotSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
        hide_input_in_errors=True,
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

    telegram_bot_token: SecretStr = Field(min_length=1)
    telegram_webapp_url: str
    environment: Literal["development", "test", "production"] = "production"

    @model_validator(mode="after")
    def valid_url(self) -> "BotSettings":
        parsed = urlsplit(self.telegram_webapp_url)
        if parsed.scheme != "https" or not parsed.netloc or parsed.fragment:
            raise ValueError("TELEGRAM_WEBAPP_URL must be an HTTPS URL without a fragment")
        if self.environment == "production":
            host = (parsed.hostname or "").rstrip(".").lower()
            if (
                not host
                or parsed.username is not None
                or parsed.password is not None
                or host == "localhost"
                or host.endswith((".localhost", ".railway.internal"))
                or "replace" in self.telegram_bot_token.get_secret_value().lower()
            ):
                raise ValueError("Set a production bot token and public HTTPS Mini App URL")
            try:
                address = ip_address(host)
            except ValueError:
                pass
            else:
                if not address.is_global:
                    raise ValueError("Mini App URL must be public")
        return self
