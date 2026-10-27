import asyncio
from datetime import timedelta
from uuid import UUID

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.field_test_seed import Checkpoints, seed_field_test
from app.models import Quest, QuestRun, ScoreEvent, Submission
from app.services import field_test, game

# Synthetic test coordinates, not operator-approved Yerevan checkpoints.
GPS = {"latitude": 40, "longitude": 44, "horizontal_accuracy": 20}


@pytest.fixture
async def field_route(database):
    points = Checkpoints.model_validate(
        {
            "checkpoints": [
                {
                    "step": step,
                    "latitude": 40,
                    "longitude": 44,
                    "radius_m": 100,
                    "reviewed_safe": True,
                }
                for step in range(1, 5)
            ]
        }
    )
    async with database.begin() as db:
        await seed_field_test(db, development=True, checkpoints=points)
        return list(
            (
                await db.scalars(
                    select(Quest)
                    .where(Quest.field_test_step.is_not(None))
                    .order_by(Quest.field_test_step)
                )
            ).all()
        )


async def start(client, headers, quest):
    result = await client.post(f"/api/v1/quests/{quest.id}/start", headers=headers)
    assert result.status_code == 201, result.text
    return result.json()["id"]


async def gps(client, headers, run):
    result = await client.post(f"/api/v1/quest-runs/{run}/check-in", headers=headers, json=GPS)
    assert result.status_code == 200, result.text
    assert result.json()["awarded_xp"] == 0
    assert result.json()["run"]["status"] == "started"
    assert result.json()["run"]["gps_verified_at"]


async def submit(client, headers, run, value):
    return await client.post(
        f"/api/v1/quest-runs/{run}/answer", headers=headers, json={"answer": value}
    )


async def state(client, headers):
    result = await client.get("/api/v1/field-test-zero", headers=headers)
    assert result.status_code == 200, result.text
    return result.json()


async def test_exact_925_ledger_sequence_concurrency_reload_and_finish(
    client, active_team, database, field_route
):
    captain, member, _, _ = await active_team()
    initial = await state(client, captain)
    assert initial["status"] == "ready" and initial["started_at"] is None
    assert initial["remaining_seconds"] == 5400
    listed = (await client.get("/api/v1/quests", headers=captain)).json()
    route = [q for q in listed if q["field_test_step"]]
    assert [q["locked"] for q in route] == [False, True, True, True]
    # Solution/paid hint are absent from ordinary quest responses.
    assert all("answer_text" not in q and q["hint_text"] is None for q in route)
    started_at = None
    for step, quest in enumerate(field_route, 1):
        run = await start(client, captain, quest)
        current = await state(client, member)
        if started_at is None:
            started_at = current["started_at"]
        assert current["started_at"] == started_at
        await gps(client, member, run)
        await gps(client, captain, run)
        if step == 2:
            hints = await asyncio.gather(
                *[
                    client.post(f"/api/v1/quest-runs/{run}/hint", headers=h)
                    for h in [captain, member, captain]
                ]
            )
            assert all(r.status_code == 200 for r in hints)
            assert sum(r.json()["penalty_xp"] for r in hints) == 50
            detail = (await client.get(f"/api/v1/quests/{quest.id}", headers=member)).json()
            assert detail["hint_used"] and "ZERO2" in detail["hint_text"]
        if step == 3:
            wrong = await asyncio.gather(
                *[
                    submit(client, h, run, answer)
                    for h, answer in [(captain, "wrong"), (member, "wrong"), (captain, "different")]
                ]
            )
            assert all(r.status_code == 200 and not r.json()["correct"] for r in wrong)
            assert sum(r.json()["penalty_xp"] for r in wrong) == 25
            detail = (await client.get(f"/api/v1/quests/{quest.id}", headers=member)).json()
            assert detail["wrong_answer_penalized"] and detail["run"]["gps_verified_at"]
        answers = await asyncio.gather(
            *[submit(client, h, run, f"  zero{step}  ") for h in [captain, member, captain]]
        )
        assert all(r.status_code == 200 and r.json()["correct"] for r in answers)
        assert sum(r.json()["awarded_xp"] for r in answers) == 250
        current = await state(client, member)
        assert current["score"] == [250, 450, 675, 925][step - 1]
        assert current["completed_quests"] == step
        # A fresh read (same one used after reopen) reconstructs unlocks from DB state.
        listed = (await client.get("/api/v1/quests", headers=member)).json()
        if step < 4:
            assert not next(q for q in listed if q["field_test_step"] == step + 1)["locked"]
    final = await state(client, captain)
    assert final["status"] == "finished"
    assert final["score"] == 925 and final["maximum_score"] == 1000
    assert final["completed_quests"] == final["total_quests"] == 4
    assert final["leaderboard_position"] == 1
    assert final["finished_at"] and 0 <= final["elapsed_seconds"] < 5400
    assert (await state(client, member))["elapsed_seconds"] == final["elapsed_seconds"]
    async with database() as db:
        events = list((await db.scalars(select(ScoreEvent).order_by(ScoreEvent.created_at))).all())
        assert [e.amount for e in events] == [250, -50, 250, -25, 250, 250]
        assert sum(e.amount for e in events) == 925
        assert [e.reason for e in events].count("quest_completion") == 4
        assert (
            await db.scalar(select(func.count()).select_from(Submission)) == 9
        )  # 4 GPS + 4 correct + 1 wrong


async def test_locked_and_gps_required_no_client_boolean(
    client, active_team, field_route, database
):
    captain, member, _, _ = await active_team()
    for quest in field_route[1:]:
        assert (
            await client.post(f"/api/v1/quests/{quest.id}/start", headers=member)
        ).status_code == 409
    run = await start(client, captain, field_route[0])
    assert (await submit(client, member, run, "ZERO1")).status_code == 409
    fake = await client.post(
        f"/api/v1/quest-runs/{run}/answer",
        headers=member,
        json={"answer": "ZERO1", "gps_verified": True},
    )
    assert fake.status_code == 422
    for data in [{**GPS, "latitude": 41}, {**GPS, "horizontal_accuracy": 151}]:
        assert (
            await client.post(f"/api/v1/quest-runs/{run}/check-in", headers=member, json=data)
        ).status_code == 422
    async with database() as db:
        assert (await db.get(QuestRun, UUID(run))).gps_verified_at is None
        assert await db.scalar(select(func.count()).select_from(ScoreEvent)) == 0


@pytest.mark.parametrize("action", ["gps", "answer", "hint", "start"])
async def test_timer_exact_expiry_closes_mutations(
    client, active_team, field_route, database, monkeypatch, action
):
    captain, _, _, _ = await active_team()
    first = await start(client, captain, field_route[0])
    await gps(client, captain, first)
    assert (await submit(client, captain, first, "ZERO1")).status_code == 200
    run = await start(client, captain, field_route[1])
    await gps(client, captain, run)
    async with database() as db:
        beginning = (await db.get(QuestRun, UUID(first))).started_at
    deadline = beginning + timedelta(minutes=90)
    monkeypatch.setattr(field_test, "utcnow", lambda: deadline)
    monkeypatch.setattr(game, "utcnow", lambda: deadline)
    if action == "gps":
        result = await client.post(f"/api/v1/quest-runs/{run}/check-in", headers=captain, json=GPS)
    elif action == "answer":
        result = await submit(client, captain, run, "ZERO2")
    elif action == "hint":
        result = await client.post(f"/api/v1/quest-runs/{run}/hint", headers=captain)
    else:
        result = await client.post(f"/api/v1/quests/{field_route[1].id}/start", headers=captain)
    assert result.status_code == 409 and "expired" in result.json()["detail"]
    expired = await state(client, captain)
    assert expired["status"] == "expired" and expired["remaining_seconds"] == 0
    assert expired["elapsed_seconds"] == 5400 and expired["score"] == 250
    # Completed rewards remain idempotently replayable, even after expiry.
    assert (await submit(client, captain, first, "ZERO1")).json()["awarded_xp"] == 0
    async with database() as db:
        assert await db.scalar(select(func.count()).select_from(ScoreEvent)) == 1


async def test_before_deadline_answer_and_shared_gps(
    client, active_team, field_route, database, monkeypatch
):
    captain, member, _, _ = await active_team()
    run = await start(client, captain, field_route[0])
    await gps(client, member, run)
    async with database() as db:
        beginning = (await db.get(QuestRun, UUID(run))).started_at
    monkeypatch.setattr(field_test, "utcnow", lambda: beginning + timedelta(seconds=5399))
    assert (await submit(client, captain, run, "ZERO1")).json()["awarded_xp"] == 250


async def test_hint_requires_gps_and_available_only_at_opera(client, active_team, field_route):
    captain, _, _, _ = await active_team()
    run = await start(client, captain, field_route[0])
    assert (await client.post(f"/api/v1/quest-runs/{run}/hint", headers=captain)).status_code == 409
    await gps(client, captain, run)
    await submit(client, captain, run, "ZERO1")
    opera = await start(client, captain, field_route[1])
    assert (
        await client.post(f"/api/v1/quest-runs/{opera}/hint", headers=captain)
    ).status_code == 409
    await gps(client, captain, opera)
    assert (await client.post(f"/api/v1/quest-runs/{opera}/hint", headers=captain)).json()[
        "penalty_xp"
    ] == 50
    await submit(client, captain, opera, "ZERO2")
    repeat = await client.post(f"/api/v1/quest-runs/{opera}/hint", headers=captain)
    assert repeat.json()["already_applied"] and repeat.json()["penalty_xp"] == 0


async def test_authorization_and_pending_team(client, login, active_team, field_route):
    captain, _, team, _ = await active_team()
    run = await start(client, captain, field_route[0])
    stranger = await login(88)
    for action in ["hint", "check-in", "answer"]:
        body = GPS if action == "check-in" else {"answer": "ZERO1"} if action == "answer" else None
        result = await client.post(
            f"/api/v1/quest-runs/{run}/{action}", headers=stranger, json=body
        )
        assert result.status_code == 403
    await client.post("/api/v1/teams", headers=stranger, json={"name": "Solo stays pending"})
    assert (
        await client.post(f"/api/v1/quests/{field_route[0].id}/start", headers=stranger)
    ).status_code == 409
    assert (await state(client, stranger))["started_at"] is None
    admin = await login(900001)
    await client.post(f"/api/v1/admin/teams/{team['id']}/block", headers=admin)
    assert (await submit(client, captain, run, "ZERO1")).status_code == 403


@pytest.mark.parametrize("reason,amount", [("hint_penalty", -50), ("wrong_answer_penalty", -25)])
async def test_database_penalty_uniqueness_and_amount(
    client, active_team, field_route, database, reason, amount
):
    captain, _, team, _ = await active_team()
    run = await start(client, captain, field_route[0])
    values = {
        "season_id": field_route[0].season_id,
        "team_id": UUID(team["id"]),
        "quest_run_id": UUID(run),
        "amount": amount,
        "reason": reason,
    }
    async with database.begin() as db:
        db.add(ScoreEvent(**values))
    with pytest.raises(IntegrityError, match="uq_penalty_score_run_reason"):
        async with database.begin() as db:
            db.add(ScoreEvent(**values))
    with pytest.raises(IntegrityError, match="penalty_requires_run"):
        async with database.begin() as db:
            db.add(ScoreEvent(**{**values, "amount": -1}))


async def test_seed_disabled_without_review_and_preserves_content(database):
    async with database.begin() as db:
        await seed_field_test(db, development=True)
        quests = list(
            (await db.scalars(select(Quest).where(Quest.field_test_step.is_not(None)))).all()
        )
        assert len(quests) == 4
        assert all(not q.is_active and q.latitude is None and q.radius_m is None for q in quests)
        quests[0].title = "Operator authored"
        await seed_field_test(db, development=False)
        assert quests[0].title == "Operator authored"


async def test_no_reconfigure_after_start(client, active_team, field_route, database):
    captain, _, _, _ = await active_team()
    await start(client, captain, field_route[0])
    points = Checkpoints.model_validate(
        {
            "checkpoints": [
                {
                    "step": step,
                    "latitude": 40,
                    "longitude": 44,
                    "radius_m": 100,
                    "reviewed_safe": True,
                }
                for step in range(1, 5)
            ]
        }
    )
    with pytest.raises(ValueError, match="has runs"):
        async with database.begin() as db:
            await seed_field_test(db, development=True, checkpoints=points)


async def test_summary_route_score_excludes_other_season_events(
    client, active_team, field_route, database
):
    captain, _, team, _ = await active_team()
    async with database.begin() as db:
        db.add(
            ScoreEvent(
                season_id=field_route[0].season_id,
                team_id=UUID(team["id"]),
                reason="admin_adjustment",
                amount=100,
                note="Other season XP",
            )
        )
    _, _, other, _ = await active_team(3, 4, "Leaderboard leader")
    async with database.begin() as db:
        db.add(
            ScoreEvent(
                season_id=field_route[0].season_id,
                team_id=UUID(other["id"]),
                reason="admin_adjustment",
                amount=200,
                note="Other team",
            )
        )
    summary = await state(client, captain)
    assert summary["score"] == 0 and summary["maximum_score"] == 1000
    assert summary["leaderboard_position"] == 2
    assert (await client.get("/api/v1/leaderboard", headers=captain)).json()[
        "current_user_team_xp"
    ] == 100


async def test_concurrent_field_starts_only_one_timer(client, active_team, field_route):
    captain, member, _, _ = await active_team()
    results = await asyncio.gather(
        *[
            client.post(f"/api/v1/quests/{field_route[0].id}/start", headers=h)
            for h in [captain, member]
        ]
    )
    assert sorted(r.status_code for r in results) == [201, 409]
    first = await state(client, captain)
    second = await state(client, member)
    assert first["started_at"] == second["started_at"]
    assert first["deadline_at"] == second["deadline_at"]


async def test_field_completion_rolls_back_if_ledger_conflicts(
    client, active_team, field_route, database
):
    captain, _, team, _ = await active_team()
    run = await start(client, captain, field_route[0])
    await gps(client, captain, run)
    async with database.begin() as db:
        db.add(
            ScoreEvent(
                season_id=field_route[0].season_id,
                team_id=UUID(team["id"]),
                quest_run_id=UUID(run),
                amount=250,
                reason="quest_completion",
            )
        )
    result = await submit(client, captain, run, "ZERO1")
    assert result.status_code == 409
    async with database() as db:
        assert (await db.get(QuestRun, UUID(run))).status.value == "started"
        assert (
            await db.scalar(select(func.count()).select_from(Submission)) == 1
        )  # GPS proof survives
        assert await db.scalar(select(func.count()).select_from(ScoreEvent)) == 1
    listed = (await client.get("/api/v1/quests", headers=captain)).json()
    assert next(q for q in listed if q["field_test_step"] == 2)["locked"]


async def test_incomplete_route_cannot_consume_timer(client, active_team, field_route, database):
    captain, _, _, _ = await active_team()
    async with database.begin() as db:
        last = await db.get(Quest, field_route[-1].id)
        last.is_active = False
    result = await client.post(f"/api/v1/quests/{field_route[0].id}/start", headers=captain)
    assert result.status_code == 409
    assert (await state(client, captain))["started_at"] is None


async def test_exact_text_matching_and_empty_answer(client, active_team, field_route):
    captain, _, _, _ = await active_team()
    run = await start(client, captain, field_route[0])
    await gps(client, captain, run)
    assert (await submit(client, captain, run, "   ")).status_code == 422
    for value in ["ZERO 1", "ZER01"]:
        result = await submit(client, captain, run, value)
        assert result.status_code == 200 and result.json()["correct"] is False
    assert (await submit(client, captain, run, "  zero1 ")).json()["correct"] is True
