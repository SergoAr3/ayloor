from uuid import UUID

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings
from app.models import Quest


async def test_ledger_ranking_adjustments_ties_and_blocked(client, login, active_team):
    captain, _, one, _ = await active_team()
    other, _, two, _ = await active_team(3, 4, "Other")
    admin = await login(900001)
    season_id = (await client.get("/api/v1/seasons/current", headers=captain)).json()["id"]
    for team, amount in [(one, 400), (two, 500), (one, -50)]:
        result = await client.post(
            "/api/v1/admin/score-events",
            headers=admin,
            json={
                "team_id": team["id"],
                "season_id": season_id,
                "amount": amount,
                "note": "Test adjustment",
            },
        )
        assert result.status_code == 201, result.text
    ranking = (await client.get("/api/v1/leaderboard", headers=captain)).json()
    assert [row["xp"] for row in ranking["entries"]] == [500, 350]
    assert ranking["current_user_team_rank"] == 2
    assert ranking["current_user_team_xp"] == 350
    assert ranking["xp_to_next_rank"] == 151
    await client.post(
        "/api/v1/admin/score-events",
        headers=admin,
        json={"team_id": one["id"], "season_id": season_id, "amount": 150, "note": "Tie"},
    )
    ranking = (await client.get("/api/v1/leaderboard", headers=other)).json()
    assert ranking["entries"][0]["team_id"] == one["id"]
    assert ranking["xp_to_next_rank"] == 1
    await client.post(f"/api/v1/admin/teams/{one['id']}/block", headers=admin)
    ranking = (await client.get("/api/v1/leaderboard", headers=other)).json()
    assert len(ranking["entries"]) == 1 and ranking["current_user_team_rank"] == 1


async def test_admin_quest_crud_and_access(client, login, database):
    admin, regular = await login(900001), await login(1)
    season_id = (await client.get("/api/v1/seasons/current", headers=admin)).json()["id"]
    payload = {
        "season_id": season_id,
        "slug": "verified-checkpoint",
        "title": "Checkpoint",
        "description": "Safe checkpoint",
        "latitude": 40.18,
        "longitude": 44.51,
        "radius_m": 100,
    }
    assert (
        await client.post("/api/v1/admin/quests", headers=regular, json=payload)
    ).status_code == 403
    created = await client.post("/api/v1/admin/quests", headers=admin, json=payload)
    assert created.status_code == 201, created.text
    quest_id = created.json()["id"]
    assert not created.json()["is_active"]
    edited = await client.put(
        f"/api/v1/admin/quests/{quest_id}", headers=admin, json={**payload, "base_xp": 150}
    )
    assert edited.status_code == 200 and edited.json()["base_xp"] == 150
    assert (
        await client.patch(
            f"/api/v1/admin/quests/{quest_id}/active", headers=admin, json={"is_active": True}
        )
    ).json()["is_active"]
    assert len((await client.get("/api/v1/admin/quests", headers=admin)).json()) == 2
    assert (await client.get("/api/v1/admin/teams", headers=admin)).status_code == 200
    assert (await client.get("/api/v1/admin/submissions", headers=admin)).status_code == 200


async def test_ledger_is_append_only(client, login, active_team, database):
    headers, _, team, _ = await active_team()
    admin = await login(900001)
    season_id = (await client.get("/api/v1/seasons/current", headers=headers)).json()["id"]
    await client.post(
        "/api/v1/admin/score-events",
        headers=admin,
        json={"team_id": team["id"], "season_id": season_id, "amount": 100, "note": "Adjustment"},
    )
    for statement in ["UPDATE score_events SET amount = 999", "DELETE FROM score_events"]:
        with pytest.raises(IntegrityError, match="append-only"):
            async with database.begin() as db:
                await db.execute(text(statement))


async def test_production_hides_debug_and_placeholder(client, login, monkeypatch):
    headers = await login(1)
    monkeypatch.setattr(get_settings(), "environment", "production")
    assert (await client.get("/api/v1/config")).json()["development_gps_enabled"] is False
    assert (await client.get("/api/v1/quests", headers=headers)).json() == []
    admin = await login(900001)
    quest = (await client.get("/api/v1/admin/quests", headers=admin)).json()[0]
    assert (
        await client.patch(
            f"/api/v1/admin/quests/{quest['id']}/active", headers=admin, json={"is_active": True}
        )
    ).status_code == 409


@pytest.mark.parametrize(
    "metadata",
    [
        {"title": "Corrected title"},
        {"description": "Corrected description", "base_xp": 150, "radius_m": 200},
        {"latitude": 0.00000001},
    ],
)
async def test_metadata_put_preserves_placeholder_and_production_activation_block(
    client, login, database, monkeypatch, metadata
):
    admin = await login(900001)
    quest = (await client.get("/api/v1/admin/quests", headers=admin)).json()[0]
    monkeypatch.setattr(get_settings(), "environment", "production")
    payload = {
        key: quest[key]
        for key in (
            "season_id",
            "slug",
            "title",
            "description",
            "base_xp",
            "latitude",
            "longitude",
            "radius_m",
            "starts_at",
            "expires_at",
        )
    }
    response = await client.put(
        f"/api/v1/admin/quests/{quest['id']}",
        headers=admin,
        json={**payload, "is_active": False, **metadata},
    )
    assert response.status_code == 200, response.text
    async with database() as db:
        saved = await db.get(Quest, UUID(quest["id"]))
        assert saved.rules_json["development_placeholder"] is True
        assert saved.latitude == 0 and saved.longitude == 0
    assert (
        await client.patch(
            f"/api/v1/admin/quests/{quest['id']}/active", headers=admin, json={"is_active": True}
        )
    ).status_code == 409
    assert (
        await client.put(
            f"/api/v1/admin/quests/{quest['id']}",
            headers=admin,
            json={**payload, "is_active": True},
        )
    ).status_code == 409
    assert (await client.get("/api/v1/quests", headers=admin)).json() == []


async def test_explicit_checkpoint_replacement_clears_only_placeholder_and_allows_activation(
    client, login, database, monkeypatch
):
    admin = await login(900001)
    quest = (await client.get("/api/v1/admin/quests", headers=admin)).json()[0]
    # The marker is the source of intent, including at a non-zero development point.
    async with database.begin() as db:
        item = await db.get(Quest, UUID(quest["id"]))
        item.latitude, item.longitude = 1, 2
        item.rules_json = {"development_placeholder": True, "operator_note": "Keep this rule"}
    monkeypatch.setattr(get_settings(), "environment", "production")
    payload = {
        "season_id": quest["season_id"],
        "slug": quest["slug"],
        "title": quest["title"],
        "description": quest["description"],
        "base_xp": 100,
        "latitude": 1,
        "longitude": 2,
    }
    metadata_only = await client.put(
        f"/api/v1/admin/quests/{quest['id']}",
        headers=admin,
        json={**payload, "title": "Metadata only"},
    )
    assert metadata_only.status_code == 200
    assert (
        await client.patch(
            f"/api/v1/admin/quests/{quest['id']}/active", headers=admin, json={"is_active": True}
        )
    ).status_code == 409
    # Synthetic test coordinates only, not a proposed production Yerevan checkpoint.
    replaced = await client.put(
        f"/api/v1/admin/quests/{quest['id']}",
        headers=admin,
        json={**payload, "latitude": 40.18, "longitude": 44.51},
    )
    assert replaced.status_code == 200, replaced.text
    async with database() as db:
        saved = await db.get(Quest, UUID(quest["id"]))
        assert saved.rules_json == {"operator_note": "Keep this rule"}
    activated = await client.patch(
        f"/api/v1/admin/quests/{quest['id']}/active", headers=admin, json={"is_active": True}
    )
    assert activated.status_code == 200 and activated.json()["is_active"]
    assert len((await client.get("/api/v1/quests", headers=admin)).json()) == 1
