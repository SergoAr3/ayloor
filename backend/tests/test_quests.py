import asyncio
from datetime import timedelta
from uuid import UUID

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import (
    Quest,
    QuestRun,
    RunStatus,
    ScoreEvent,
    Season,
    Submission,
    TeamMember,
    utcnow,
)
from app.seed import seed
from app.services.game import haversine_m

VALID = {"latitude": 0, "longitude": 0, "horizontal_accuracy": 25}


async def first_quest(client, headers):
    response = await client.get("/api/v1/quests", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()[0]["id"]


async def start_run(client, headers):
    quest_id = await first_quest(client, headers)
    response = await client.post(f"/api/v1/quests/{quest_id}/start", headers=headers)
    assert response.status_code == 201, response.text
    return quest_id, response.json()["id"]


async def test_full_vertical_slice_and_idempotency(client, active_team, database):
    captain, member, team, _ = await active_team()
    quest_id, run_id = await start_run(client, captain)
    assert (
        await client.post(f"/api/v1/quests/{quest_id}/start", headers=member)
    ).status_code == 409
    detail = (await client.get(f"/api/v1/quests/{quest_id}", headers=member)).json()
    assert detail["run"]["id"] == run_id
    response = await client.post(
        f"/api/v1/quest-runs/{run_id}/check-in", headers=member, json=VALID
    )
    assert response.status_code == 200, response.text
    assert response.json()["awarded_xp"] == 100
    assert response.json()["run"]["status"] == "completed"
    repeat = await client.post(f"/api/v1/quest-runs/{run_id}/check-in", headers=captain, json=VALID)
    assert repeat.status_code == 200 and repeat.json()["awarded_xp"] == 0
    assert repeat.json()["already_completed"]
    assert (
        await client.post(f"/api/v1/quests/{quest_id}/start", headers=captain)
    ).status_code == 409
    ranking = (await client.get("/api/v1/leaderboard", headers=captain)).json()
    assert ranking["entries"][0]["team_id"] == team["id"]
    assert ranking["current_user_team_xp"] == 100
    async with database() as db:
        assert await db.scalar(select(func.count()).select_from(ScoreEvent)) == 1
        assert await db.scalar(select(func.count()).select_from(Submission)) == 1
        assert (await db.get(QuestRun, UUID(run_id))).completed_at is not None


async def test_pending_team_cannot_start(client, login):
    headers = await login(1)
    await client.post("/api/v1/teams", headers=headers, json={"name": "Pending"})
    quest_id = await first_quest(client, headers)
    assert (
        await client.post(f"/api/v1/quests/{quest_id}/start", headers=headers)
    ).status_code == 409


@pytest.mark.parametrize(
    "coordinates",
    [
        {**VALID, "latitude": 1},
        {**VALID, "horizontal_accuracy": 151},
        {**VALID, "horizontal_accuracy": -1},
        {**VALID, "horizontal_accuracy": None},
        {**VALID, "latitude": 91},
        {**VALID, "longitude": -181},
        {**VALID, "skip_verification": True},
        {**VALID, "latitude": "NaN"},
        {**VALID, "horizontal_accuracy": "Infinity"},
    ],
)
async def test_invalid_checkin_no_mutation(client, active_team, database, coordinates):
    headers, _, _, _ = await active_team()
    _, run_id = await start_run(client, headers)
    result = await client.post(
        f"/api/v1/quest-runs/{run_id}/check-in", headers=headers, json=coordinates
    )
    assert result.status_code == 422
    async with database() as db:
        assert (await db.get(QuestRun, UUID(run_id))).status == RunStatus.started
        assert await db.scalar(select(func.count()).select_from(ScoreEvent)) == 0
        assert await db.scalar(select(func.count()).select_from(Submission)) == 0


async def test_stranger_cannot_checkin(client, login, active_team):
    headers, _, _, _ = await active_team()
    _, run_id = await start_run(client, headers)
    stranger = await login(3)
    assert (
        await client.post(f"/api/v1/quest-runs/{run_id}/check-in", headers=stranger, json=VALID)
    ).status_code == 403


async def test_disabled_and_expired_quest(client, active_team, database):
    headers, _, _, _ = await active_team()
    quest_id, run_id = await start_run(client, headers)
    async with database.begin() as db:
        quest = await db.get(Quest, UUID(quest_id))
        quest.is_active = False
    assert (
        await client.post(f"/api/v1/quest-runs/{run_id}/check-in", headers=headers, json=VALID)
    ).status_code == 409
    async with database.begin() as db:
        quest = await db.get(Quest, UUID(quest_id))
        quest.is_active = True
        quest.expires_at = utcnow() - timedelta(seconds=1)
    assert (
        await client.post(f"/api/v1/quest-runs/{run_id}/check-in", headers=headers, json=VALID)
    ).status_code == 409


async def test_expired_season(client, active_team, database):
    headers, _, _, _ = await active_team()
    _, run_id = await start_run(client, headers)
    async with database.begin() as db:
        season = await db.scalar(select(Season))
        season.ends_at = utcnow() - timedelta(seconds=1)
    assert (
        await client.post(f"/api/v1/quest-runs/{run_id}/check-in", headers=headers, json=VALID)
    ).status_code == 409
    assert (await client.get("/api/v1/leaderboard", headers=headers)).json()["entries"] == []


@pytest.mark.parametrize("availability", ["future", "expired", "inactive"])
async def test_unavailable_quest_cannot_start(client, active_team, database, availability):
    headers, _, _, _ = await active_team()
    quest_id = await first_quest(client, headers)
    async with database.begin() as db:
        quest = await db.get(Quest, UUID(quest_id))
        if availability == "future":
            quest.starts_at = utcnow() + timedelta(hours=1)
        elif availability == "expired":
            quest.expires_at = utcnow() - timedelta(hours=1)
        else:
            quest.is_active = False
    assert (
        await client.post(f"/api/v1/quests/{quest_id}/start", headers=headers)
    ).status_code == 409


async def test_production_seed_does_not_activate_placeholder(database):
    from sqlalchemy import delete

    async with database.begin() as db:
        await db.execute(delete(Quest))
        await seed(db, development=False)
        quest = await db.scalar(select(Quest))
        assert not quest.is_active
        assert quest.rules_json["development_placeholder"]


async def test_blocked_team_cannot_finish_started_run(client, login, active_team, database):
    captain, member, team, _ = await active_team()
    _, run_id = await start_run(client, captain)
    admin = await login(900001)
    await client.post(f"/api/v1/admin/teams/{team['id']}/block", headers=admin)
    assert (
        await client.post(f"/api/v1/quest-runs/{run_id}/check-in", headers=member, json=VALID)
    ).status_code == 403
    async with database() as db:
        assert await db.scalar(select(func.count()).select_from(ScoreEvent)) == 0


async def test_concurrent_starts(client, active_team):
    captain, member, _, _ = await active_team()
    quest_id = await first_quest(client, captain)
    results = await asyncio.gather(
        *[client.post(f"/api/v1/quests/{quest_id}/start", headers=h) for h in [captain, member]]
    )
    assert sorted(r.status_code for r in results) == [201, 409]


async def test_concurrent_checkins_single_award(client, active_team, database):
    captain, member, _, _ = await active_team()
    _, run_id = await start_run(client, captain)
    results = await asyncio.gather(
        *[
            client.post(f"/api/v1/quest-runs/{run_id}/check-in", headers=h, json=VALID)
            for h in [captain, member, captain, member]
        ]
    )
    assert [r.status_code for r in results] == [200] * 4
    assert sum(r.json()["awarded_xp"] for r in results) == 100
    async with database() as db:
        assert await db.scalar(select(func.count()).select_from(ScoreEvent)) == 1
        assert await db.scalar(select(func.count()).select_from(Submission)) == 1


async def test_db_rejects_duplicate_completion_and_run(client, active_team, database):
    headers, _, _, _ = await active_team()
    _, run_id = await start_run(client, headers)
    await client.post(f"/api/v1/quest-runs/{run_id}/check-in", headers=headers, json=VALID)
    async with database() as db:
        event = await db.scalar(select(ScoreEvent))
        values = {
            key: getattr(event, key)
            for key in ("team_id", "season_id", "user_id", "quest_run_id", "amount", "reason")
        }
        run = await db.get(QuestRun, UUID(run_id))
        run_values = {"team_id": run.team_id, "quest_id": run.quest_id}
    with pytest.raises(IntegrityError, match="uq_completion_score_run"):
        async with database.begin() as db:
            db.add(ScoreEvent(**values))
    with pytest.raises(IntegrityError, match="uq_team_quest_once"):
        async with database.begin() as db:
            db.add(QuestRun(**run_values))


async def test_atomic_completion_rolls_back_if_ledger_conflicts(client, active_team, database):
    headers, _, team, _ = await active_team()
    _, run_id = await start_run(client, headers)
    # Pre-existing completion deliberately conflicts with the service transaction.
    async with database.begin() as db:
        season = await db.scalar(select(Season))
        db.add(
            ScoreEvent(
                season_id=season.id,
                team_id=UUID(team["id"]),
                quest_run_id=UUID(run_id),
                amount=100,
                reason="quest_completion",
            )
        )
    result = await client.post(f"/api/v1/quest-runs/{run_id}/check-in", headers=headers, json=VALID)
    assert result.status_code == 409
    async with database() as db:
        assert (await db.get(QuestRun, UUID(run_id))).status == RunStatus.started
        assert await db.scalar(select(func.count()).select_from(Submission)) == 0
        assert await db.scalar(select(func.count()).select_from(ScoreEvent)) == 1


async def test_db_membership_uniqueness_without_service(client, active_team, database):
    _, _, one, _ = await active_team()
    _, _, two, _ = await active_team(3, 4, "Other")
    async with database() as db:
        member = await db.scalar(select(TeamMember).where(TeamMember.team_id == UUID(one["id"])))
        user_id, city_id = member.user_id, member.city_id
    with pytest.raises(IntegrityError, match="uq_current_membership_city"):
        async with database.begin() as db:
            db.add(TeamMember(user_id=user_id, city_id=city_id, team_id=UUID(two["id"])))


async def test_seed_idempotent_and_preserves_edits(database):
    async with database.begin() as db:
        quest = await db.scalar(select(Quest))
        quest.title = "Operator edit"
        await seed(db, development=True)
        await seed(db, development=True)
    async with database() as db:
        assert await db.scalar(select(func.count()).select_from(Quest)) == 1
        assert (await db.scalar(select(Quest))).title == "Operator edit"


def test_haversine():
    assert haversine_m(0, 0, 0, 0) == 0
    assert haversine_m(0, 0, 0, 1) == pytest.approx(111195, rel=0.001)
    assert haversine_m(0, 179.9999, 0, -179.9999) < 23
    assert haversine_m(0, 0, 0, 180) == pytest.approx(20015087, rel=0.001)
