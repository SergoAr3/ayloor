"""Exercise real Alembic transitions against the guarded PostgreSQL test DB."""

import asyncio
import sys
from uuid import UUID

from sqlalchemy import select
from test_quests import VALID, start_run

from app.core.config import ROOT
from app.models import Quest, QuestRun, ScoreEvent


async def alembic(*args):
    # conftest validated DATABASE_URL and installed only the dedicated test target.
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "alembic",
        "-c",
        str(ROOT / "backend/alembic.ini"),
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    output, _ = await process.communicate()
    assert process.returncode == 0, output.decode()


async def test_roundtrip_preserves_legacy_completed_quest(client, active_team, database):
    headers, _, _, _ = await active_team()
    quest_id, run_id = await start_run(client, headers)
    result = await client.post(f"/api/v1/quest-runs/{run_id}/check-in", headers=headers, json=VALID)
    assert result.status_code == 200
    await alembic("downgrade", "0002")
    await alembic("upgrade", "head")
    await alembic("check")
    async with database() as db:
        quest = await db.get(Quest, UUID(quest_id))
        run = await db.get(QuestRun, UUID(run_id))
        assert quest.field_test_step is None and quest.answer_text is None
        assert run.status.value == "completed" and run.gps_verified_at is None
        assert (await db.scalar(select(ScoreEvent))).amount == 100
    replay = await client.post(f"/api/v1/quest-runs/{run_id}/check-in", headers=headers, json=VALID)
    assert replay.status_code == 200 and replay.json()["awarded_xp"] == 0
