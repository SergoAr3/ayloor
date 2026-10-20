import hashlib
import hmac
import json
import time
from datetime import timedelta
from urllib.parse import parse_qsl
from uuid import UUID

import jwt
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.config import Settings
from app.models import utcnow


class TelegramUser(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: int = Field(strict=True, gt=0, le=2**63 - 1)
    username: str | None = Field(default=None, max_length=255)
    first_name: str | None = Field(default=None, max_length=255)
    last_name: str | None = Field(default=None, max_length=255)
    language_code: str | None = Field(default=None, max_length=32)


def validate_init_data(raw: str, settings: Settings) -> TelegramUser:
    try:
        pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=True, max_num_fields=100)
        data = dict(pairs)
        if len(pairs) != len(data):
            raise ValueError("Duplicate initData fields")
        received_hash = data.pop("hash")
        check_string = "\n".join(f"{key}={value}" for key, value in sorted(data.items()))
        secret = hmac.new(
            b"WebAppData", settings.telegram_bot_token.get_secret_value().encode(), hashlib.sha256
        ).digest()
        expected = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, received_hash):
            raise ValueError("Invalid signature")
        age = time.time() - int(data["auth_date"])
        if age < -30 or age > settings.telegram_init_data_max_age_seconds:
            raise ValueError("Expired or future initData")
        return TelegramUser.model_validate(json.loads(data["user"]))
    except (KeyError, ValueError, TypeError, ValidationError) as exc:
        raise HTTPException(401, "Invalid or expired Telegram initData") from exc


def create_access_token(user_id: UUID, settings: Settings) -> str:
    now = utcnow()
    return jwt.encode(
        {
            "sub": str(user_id),
            "iat": now,
            "exp": now + timedelta(minutes=settings.jwt_expiration_minutes),
            "iss": "ayloor",
            "aud": "ayloor-miniapp",
        },
        settings.app_secret_key.get_secret_value(),
        algorithm="HS256",
    )


def decode_access_token(token: str, settings: Settings) -> UUID:
    try:
        payload = jwt.decode(
            token,
            settings.app_secret_key.get_secret_value(),
            algorithms=["HS256"],
            issuer="ayloor",
            audience="ayloor-miniapp",
            options={"require": ["sub", "iat", "exp"]},
        )
        return UUID(payload["sub"])
    except (jwt.PyJWTError, ValueError, TypeError, KeyError) as exc:
        raise HTTPException(
            401, "Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"}
        ) from exc
