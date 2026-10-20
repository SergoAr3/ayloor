import asyncio
import time
from datetime import timedelta
from uuid import uuid4

import jwt
import pytest
from conftest import signed_init_data

from app.core.config import get_settings
from app.models import utcnow


async def test_auth_creates_and_reuses_user(client):
    payload = {"init_data": signed_init_data(123)}
    one = await client.post("/api/v1/auth/telegram", json=payload)
    two = await client.post("/api/v1/auth/telegram", json=payload)
    assert one.status_code == two.status_code == 200
    assert one.json()["user"]["id"] == two.json()["user"]["id"]
    token = one.json()["access_token"]
    response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["team"] is None
    assert response.json()["city"]["slug"] == "yerevan"
    assert response.json()["season"]["slug"] == "yerevan-season-zero"


@pytest.mark.parametrize(
    "payload",
    [
        "invalid",
        "telegram_id=123",
        signed_init_data(1) + "&auth_date=0",
        signed_init_data(1, auth_date=int(time.time()) - 90000),
        signed_init_data(1, auth_date=int(time.time()) + 600),
        signed_init_data(1).replace("hash=", "hash=00"),
        signed_init_data(1, user='{"id":true}'),
        signed_init_data(1, user='{"id":-1}'),
    ],
)
async def test_invalid_auth_rejected(client, payload):
    response = await client.post("/api/v1/auth/telegram", json={"init_data": payload})
    assert response.status_code == 401


async def test_frontend_id_is_not_auth(client):
    assert (await client.post("/api/v1/auth/telegram", json={"telegram_id": 1})).status_code == 422
    assert (await client.get("/api/v1/me")).status_code == 401
    assert (
        await client.get("/api/v1/me", headers={"Authorization": "Bearer forged"})
    ).status_code == 401


async def test_expired_jwt_rejected(client):
    now = utcnow()
    token = jwt.encode(
        {
            "sub": str(uuid4()),
            "iat": now - timedelta(hours=2),
            "exp": now - timedelta(hours=1),
            "iss": "ayloor",
            "aud": "ayloor-miniapp",
        },
        get_settings().app_secret_key.get_secret_value(),
        algorithm="HS256",
    )
    assert (
        await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    ).status_code == 401


async def test_concurrent_auth_single_user(client):
    results = await asyncio.gather(
        *[
            client.post("/api/v1/auth/telegram", json={"init_data": signed_init_data(123)})
            for _ in range(4)
        ]
    )
    assert all(r.status_code == 200 for r in results)
    assert len({r.json()["user"]["id"] for r in results}) == 1


async def test_admin_whitelist(client, login):
    assert (await client.get("/api/v1/admin/users")).status_code == 401
    regular, admin = await login(1), await login(900001)
    assert (await client.get("/api/v1/admin/users", headers=regular)).status_code == 403
    assert (await client.get("/api/v1/admin/users", headers=admin)).status_code == 200
    assert (await client.get("/api/v1/admin/users?limit=10000", headers=admin)).status_code == 422
