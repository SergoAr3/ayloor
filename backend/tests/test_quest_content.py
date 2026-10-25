from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.api import QuestInput

PREFIX = "https://example.org/"
PAYLOAD = {
    "season_id": str(uuid4()),
    "slug": "image-url-checkpoint",
    "title": "Image URL checkpoint",
    "description": "Use the public path",
    "latitude": 40.18,
    "longitude": 44.51,
}
IMAGE_URL_CASES = [
    pytest.param(None, None, True, id="null"),
    pytest.param(PREFIX + "photo.jpg", PREFIX + "photo.jpg", True, id="https"),
    pytest.param(
        PREFIX + "é" * 337 + "aaaaa",
        PREFIX + "%C3%A9" * 337 + "aaaaa",
        True,
        id="normalized-2047",
    ),
    pytest.param(PREFIX + "é" * 338, PREFIX + "%C3%A9" * 338, True, id="normalized-2048"),
    pytest.param(PREFIX + "é" * 338 + "a", None, False, id="normalized-2049"),
    pytest.param(PREFIX + "é" * 400, None, False, id="review-unicode-2420"),
    pytest.param("http://example.org/photo.jpg", None, False, id="http"),
    pytest.param("https://user@example.org/photo.jpg", None, False, id="username"),
    pytest.param("https://user:pass@example.org/photo.jpg", None, False, id="credentials"),
    pytest.param("javascript:alert(1)", None, False, id="javascript"),
]


@pytest.mark.parametrize(("url", "normalized", "valid"), IMAGE_URL_CASES)
def test_image_url_schema_checks_final_representation(url, normalized, valid):
    # Every reproduction fits the raw field limit, including the rejected Unicode URLs.
    assert url is None or len(url) <= 2048
    if valid:
        result = QuestInput(**PAYLOAD, hero_image_url=url)
        assert result.hero_image_url == normalized
        assert normalized is None or len(normalized) <= 2048
    else:
        with pytest.raises(ValidationError, match="hero_image_url"):
            QuestInput(**PAYLOAD, hero_image_url=url)


@pytest.mark.parametrize("method", ["POST", "PUT"])
@pytest.mark.parametrize(("url", "normalized", "valid"), IMAGE_URL_CASES)
async def test_admin_image_url_validation(client, login, method, url, normalized, valid):
    admin = await login(900001)
    season = (await client.get("/api/v1/seasons/current", headers=admin)).json()
    payload = {**PAYLOAD, "season_id": season["id"]}
    path = "/api/v1/admin/quests"
    original_url = PREFIX + "original.jpg"
    if method == "PUT":
        created = await client.post(
            path, headers=admin, json={**payload, "hero_image_url": original_url}
        )
        assert created.status_code == 201, created.text
        quest_id = created.json()["id"]
        path += f"/{quest_id}"

    response = await client.request(
        method, path, headers=admin, json={**payload, "hero_image_url": url}
    )
    if valid:
        assert response.status_code == (201 if method == "POST" else 200), response.text
        assert response.json()["hero_image_url"] == normalized
        quest_id = response.json()["id"]
        stored = await client.get("/api/v1/admin/quests", headers=admin)
        assert next(q for q in stored.json() if q["id"] == quest_id)["hero_image_url"] == normalized
    else:
        assert response.status_code == 422, response.text
        assert any(
            error["loc"] == ["body", "hero_image_url"] for error in response.json()["detail"]
        )
        stored = (await client.get("/api/v1/admin/quests", headers=admin)).json()
        authored = [q for q in stored if q["slug"] == payload["slug"]]
        if method == "PUT":
            assert len(authored) == 1
            assert authored[0]["hero_image_url"] == original_url
        else:
            assert authored == []
