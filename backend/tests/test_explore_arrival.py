"""Optional Arrival uses real transactions and never gates solving."""

import asyncio
import math
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from test_explore import ROOT, post, start
from test_field_test_migration import alembic

from app.explore_seed import seed
from app.models import ExploreRun, Guide, GuideStop, utcnow


@pytest.fixture
async def demo(database):
    async with database.begin() as db:
        return (await seed(db)).slug


@pytest.fixture
async def checkpoint(database):
    async with database.begin() as db:
        guide = Guide(slug="arrival-test", title="Synthetic GPS", description="Not a real walk")
        db.add(guide)
        await db.flush()
        for position in (1, 2):
            db.add(
                GuideStop(
                    guide_id=guide.id,
                    position=position,
                    title="Test stop",
                    clue="Test clue",
                    answer="yes",
                    hint="Test hint",
                    reveal="Test reveal",
                    directions="Synthetic fixture only. Do not travel to these coordinates.",
                    latitude=0,
                    longitude=0,
                    radius_m=100,
                    max_accuracy_m=50,
                )
            )
        return guide.slug


def sample(distance=0, accuracy=10, age=0):
    return {
        "latitude": math.degrees(distance / 6371000),
        "longitude": 0,
        "accuracy_m": accuracy,
        "captured_at": (utcnow() - timedelta(seconds=age)).isoformat(),
    }


@pytest.mark.parametrize(
    "distance,accuracy,expected",
    [
        (0, 0, "confirmed"),
        (50, 50, "confirmed"),
        (0, 51, "low_accuracy"),
        (80, 30, "uncertain"),
        (100, 10, "uncertain"),
        (109, 10, "uncertain"),
        (111, 10, "outside"),
        (200, 51, "low_accuracy"),
    ],
)
async def test_distance_accuracy_policy(client, checkpoint, distance, accuracy, expected):
    run, headers = await start(client, checkpoint)
    response = await post(client, run, headers, "arrival", **sample(distance, accuracy))
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["outcome"] == expected
    assert result["run"]["phase"] == "clue" and result["run"]["stop"]["reveal"] is None
    assert result["run"]["arrival"]["status"] == (
        "confirmed" if expected == "confirmed" else "unconfirmed"
    )
    assert "accuracy_m" not in result and "latitude" not in result
    # No outcome (including uncertainty) gates Answer.
    answer = await post(client, run, headers, "answer", answer="yes")
    assert answer.json()["run"]["phase"] == "reveal"


async def test_resume_replays_and_continue_clear_marker(client, checkpoint, database):
    run, headers = await start(client, checkpoint)
    results = await asyncio.gather(
        *(post(client, run, headers, "arrival", **sample()) for _ in range(4))
    )
    confirmed = results[0].json()["run"]
    assert all(r.status_code == 200 and r.json()["run"] == confirmed for r in results)
    assert confirmed["arrival"]["confirmed_at"]
    assert (await client.get(f"{ROOT}/runs/{run['id']}", headers=headers)).json() == confirmed
    # Even stale retry data does not replace the first server confirmation.
    replay = await post(client, run, headers, "arrival", **sample(1000, 999, 600))
    assert replay.json()["run"] == confirmed
    async with database() as db:
        stored = await db.get(ExploreRun, UUID(run["id"]))
        assert stored.arrived_stop_id == UUID(run["stop"]["id"])
        assert stored.arrived_at is not None
    await post(client, run, headers, "answer", answer="yes")
    second = (await post(client, run, headers, "continue")).json()
    assert second["stop"]["position"] == 2 and second["arrival"] == {
        "status": "unconfirmed",
        "confirmed_at": None,
    }
    assert (await post(client, run, headers, "arrival", **sample())).status_code == 409
    await post(client, second, headers, "arrival", **sample())
    await post(client, second, headers, "answer", answer="yes")
    finished = (await post(client, second, headers, "continue")).json()
    assert finished["phase"] == "finished" and finished["arrival"]["confirmed_at"] is None
    assert (await post(client, second, headers, "arrival", **sample())).status_code == 409


async def test_arrival_racing_answer_and_continue(client, checkpoint):
    run, headers = await start(client, checkpoint)
    await asyncio.gather(
        post(client, run, headers, "arrival", **sample()),
        post(client, run, headers, "answer", answer="yes"),
    )
    state = (await client.get(f"{ROOT}/runs/{run['id']}", headers=headers)).json()
    assert state["phase"] == "reveal" and state["arrival"]["status"] == "confirmed"
    results = await asyncio.gather(
        post(client, run, headers, "continue"), post(client, run, headers, "arrival", **sample())
    )
    assert results[0].status_code == 200 and results[1].status_code in (200, 409)
    second = (await client.get(f"{ROOT}/runs/{run['id']}", headers=headers)).json()
    assert second["stop"]["position"] == 2 and second["arrival"]["confirmed_at"] is None
    # A delayed old Continue must not clear the new stop's confirmation.
    new = (await post(client, second, headers, "arrival", **sample())).json()["run"]
    assert (await post(client, run, headers, "continue")).json() == new


async def test_auth_foreign_future_unconfigured_and_invalid_input(
    client, checkpoint, demo, login, database
):
    run, headers = await start(client, checkpoint)
    other, other_headers = await start(client, demo)
    for auth in ({}, other_headers, await login(88)):
        assert (await post(client, run, auth, "arrival", **sample())).status_code == 401
    assert (await post(client, other, other_headers, "arrival", **sample())).status_code == 409
    async with database() as db:
        stored = await db.get(ExploreRun, UUID(run["id"]))
        future = await db.scalar(
            select(GuideStop).where(GuideStop.guide_id == stored.guide_id, GuideStop.position == 2)
        )
        future_id = str(future.id)
    for stop_id in (str(uuid4()), other["stop"]["id"], future_id):
        payload = {**sample(), "stop_id": stop_id}
        response = await client.post(
            f"{ROOT}/runs/{run['id']}/arrival", headers=headers, json=payload
        )
        assert response.status_code == 409
    for invalid in (
        {"latitude": 91},
        {"longitude": -181},
        {"accuracy_m": -1},
        {"accuracy_m": "NaN"},
        {"latitude": "Infinity"},
        {"accuracy_m": None},
        {"captured_at": "2026-01-01T00:00:00"},
        {"skip_verification": True},
    ):
        assert (
            await post(client, run, headers, "arrival", **(sample() | invalid))
        ).status_code == 422
    for age in (121, -31):
        result = await post(client, run, headers, "arrival", **sample(age=age))
        assert result.json()["outcome"] == "stale_sample"
    assert (await client.get(f"{ROOT}/runs/{run['id']}", headers=headers)).json() == run


async def test_arrival_rollback(client, checkpoint, monkeypatch):
    from app.api import explore

    run, headers = await start(client, checkpoint)
    original = explore.snapshot

    async def fail(*args):
        raise RuntimeError("after flush")

    monkeypatch.setattr(explore, "snapshot", fail)
    with pytest.raises(RuntimeError, match="after flush"):
        await post(client, run, headers, "arrival", **sample())
    monkeypatch.setattr(explore, "snapshot", original)
    assert (await client.get(f"{ROOT}/runs/{run['id']}", headers=headers)).json() == run


async def test_migration_0005_preserves_existing_explore(client, demo, database):
    run, headers = await start(client, demo)
    await post(client, run, headers, "hint")
    expected = (await post(client, run, headers, "answer", answer="closer")).json()["run"]
    await alembic("downgrade", "0004")
    await alembic("upgrade", "head")
    await alembic("check")
    assert (await client.get(f"{ROOT}/runs/{run['id']}", headers=headers)).json() == expected
    async with database() as db:
        stored = await db.get(ExploreRun, UUID(run["id"]))
        assert stored.arrived_stop_id is None and stored.arrived_at is None


@pytest.mark.parametrize(
    "assignment",
    [
        "latitude = 0",
        "latitude = 91",
        "radius_m = 0",
        "max_accuracy_m = 'NaN'",
        "radius_m = 'Infinity'",
        "longitude = NULL",
        "directions = '   '",
    ],
)
async def test_checkpoint_database_constraints(checkpoint, database, assignment):
    # Full config already exists, so latitude=0 is tested against cleared config.
    async with database.begin() as db:
        if assignment == "latitude = 0":
            await db.execute(
                text(
                    "UPDATE explore_stops SET latitude=NULL, longitude=NULL, radius_m=NULL, max_accuracy_m=NULL"
                )
            )
    with pytest.raises(IntegrityError):
        async with database.begin() as db:
            await db.execute(text(f"UPDATE explore_stops SET {assignment}"))
