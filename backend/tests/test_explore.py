"""Explore contracts against PostgreSQL: state, isolation, retries and concurrency."""

import asyncio
import secrets
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from app.explore_seed import seed
from app.models import ExploreRun, Guide, GuideStop, ScoreEvent, Team, User

ROOT = "/api/v1/explore"


@pytest.fixture
async def demo(database):
    async with database.begin() as db:
        guide = await seed(db)
        return guide.slug


async def start(client, demo, key=None):
    response = await client.post(
        f"{ROOT}/guides/{demo}/runs",
        json={
            "start_key": key or secrets.token_hex(32),
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    return data["run"], {"Authorization": f"Bearer {data['credential']}"}


async def post(client, run, headers, action, **extra):
    return await client.post(
        f"{ROOT}/runs/{run['id']}/{action}",
        headers=headers,
        json={"stop_id": run["stop"]["id"], **extra},
    )


async def test_full_flow_exact_resume_and_no_multiplayer_records(client, demo, database):
    public = await client.get(f"{ROOT}/guides/{demo}")
    assert public.status_code == 200 and public.json()["stop_count"] == 2
    assert "answer" not in public.text and "reveal" not in public.text
    run, headers = await start(client, demo)
    path = f"{ROOT}/runs/{run['id']}"
    assert run["phase"] == "clue" and run["stop"]["reveal"] is None
    assert run["stop"]["hint"] is None
    premature = await post(client, run, headers, "continue")
    assert premature.status_code == 409
    wrong = await post(client, run, headers, "answer", answer="wrong")
    assert wrong.status_code == 200 and not wrong.json()["accepted"]
    assert wrong.json()["run"] == run
    hinted = await post(client, run, headers, "hint")
    assert hinted.status_code == 200 and hinted.json()["stop"]["hint"]
    assert (await client.get(path, headers=headers)).json() == hinted.json()
    correct = await post(client, run, headers, "answer", answer="  CLOSER  ")
    reveal = correct.json()["run"]
    assert correct.json()["accepted"] and reveal["phase"] == "reveal"
    assert reveal["stop"]["reveal"] and reveal["stop"]["position"] == 1
    assert (await client.get(path, headers=headers)).json() == reveal
    second = (await post(client, run, headers, "continue")).json()
    assert second["phase"] == "clue" and second["stop"]["position"] == 2
    assert second["stop"]["reveal"] is None and second["stop"]["hint"] is None
    assert (await client.get(path, headers=headers)).json() == second
    await post(client, second, headers, "answer", answer="3")
    finished = (await post(client, second, headers, "continue")).json()
    assert finished["phase"] == "finished"
    assert (await client.get(path, headers=headers)).json() == finished
    assert (await post(client, second, headers, "continue")).json() == finished
    assert (await post(client, run, headers, "answer", answer="closer")).json()["run"] == finished
    async with database() as db:
        for model in [User, Team, ScoreEvent]:
            assert await db.scalar(select(func.count()).select_from(model)) == 0
        stored = await db.get(ExploreRun, UUID(run["id"]))
        assert headers["Authorization"][7:] not in (stored.credential_hash, stored.start_hash)


async def test_concurrent_start_answer_continue_and_stale_commands(client, demo, database):
    key = secrets.token_hex(32)
    starts = await asyncio.gather(*(start(client, demo, key) for _ in range(4)))
    run, headers = starts[0]
    assert all(item == starts[0] for item in starts)
    answers = await asyncio.gather(
        *(post(client, run, headers, "answer", answer="closer") for _ in range(4))
    )
    assert all(r.status_code == 200 and r.json()["accepted"] for r in answers)
    advanced = await asyncio.gather(*(post(client, run, headers, "continue") for _ in range(4)))
    assert all(r.status_code == 200 and r.json()["stop"]["position"] == 2 for r in advanced)
    second = advanced[0].json()
    # An old Continue arriving after the new stop's answer must not skip its Reveal.
    await post(client, second, headers, "answer", answer="3")
    stale = await post(client, run, headers, "continue")
    assert stale.json()["phase"] == "reveal" and stale.json()["stop"]["position"] == 2
    finishes = await asyncio.gather(*(post(client, second, headers, "continue") for _ in range(4)))
    assert all(r.status_code == 200 and r.json()["phase"] == "finished" for r in finishes)
    async with database() as db:
        assert await db.scalar(select(func.count()).select_from(ExploreRun)) == 1


async def test_guest_auth_boundaries_and_private_content(client, demo, login, database):
    run, headers = await start(client, demo)
    other, other_headers = await start(client, demo)
    path = f"{ROOT}/runs/{run['id']}"
    for auth in [{}, other_headers, {"Authorization": "Bearer " + "f" * 64}, await login(55)]:
        response = await client.get(path, headers=auth)
        assert response.status_code == 401
    assert (await client.get("/api/v1/me", headers=headers)).status_code == 401
    assert (await client.get("/api/v1/admin/users", headers=headers)).status_code == 401
    async with database() as db:
        future = await db.scalar(select(GuideStop).where(GuideStop.position == 2))
        future_id = str(future.id)
    for action in ["answer", "continue", "hint"]:
        payload = {"stop_id": future_id}
        if action == "answer":
            payload["answer"] = "3"
        response = await client.post(f"{path}/{action}", headers=headers, json=payload)
        assert response.status_code == 409
    assert (await client.get(path, headers=headers)).json() == run
    assert (await client.get(f"{ROOT}/runs/{uuid4()}", headers=other_headers)).status_code == 401
    assert (await post(client, other, headers, "hint")).status_code == 401
    read = await client.get(path, headers=headers)
    assert read.headers["cache-control"] == "no-store"
    assert "credential" not in read.text and "start_hash" not in read.text
    assert "answer" not in read.json()["stop"]


async def test_seed_immutable_and_missing_invalid_inputs(client, demo, database):
    async with database.begin() as db:
        await seed(db)
        assert await db.scalar(select(func.count()).select_from(Guide)) == 1
        assert await db.scalar(select(func.count()).select_from(GuideStop)) == 2
    assert (await client.get(f"{ROOT}/guides/missing")).status_code == 404
    assert (
        await client.post(
            f"{ROOT}/guides/missing/runs",
            json={
                "start_key": secrets.token_hex(32),
            },
        )
    ).status_code == 404
    assert (
        await client.post(
            f"{ROOT}/guides/{demo}/runs",
            json={
                "start_key": "invalid-secret",
            },
        )
    ).status_code == 422
    run, headers = await start(client, demo)
    for answer in ["", "x" * 201]:
        assert (await post(client, run, headers, "answer", answer=answer)).status_code == 422
    assert (await post(client, run, headers, "continue", skip=True)).status_code == 422


async def test_answer_rolls_back_if_response_construction_fails(client, demo, monkeypatch):
    from app.api import explore

    run, headers = await start(client, demo)
    original = explore.snapshot

    async def fail_snapshot(*args):
        raise RuntimeError("synthetic failure after flush")

    monkeypatch.setattr(explore, "snapshot", fail_snapshot)
    with pytest.raises(RuntimeError, match="after flush"):
        await post(client, run, headers, "answer", answer="closer")
    monkeypatch.setattr(explore, "snapshot", original)
    assert (await client.get(f"{ROOT}/runs/{run['id']}", headers=headers)).json() == run
