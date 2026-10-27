"""Opt-in FIELD TEST 0 seed; checkpoints require explicit operator review."""

import argparse
import asyncio
import json
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import SessionFactory, engine
from app.models import Quest, QuestRun, Season
from app.schemas.api import Input, Latitude, Longitude
from app.seed import seed

PLACES = ("Cascade", "Opera", "Aznavour Square", "Republic Square")


class Checkpoint(Input):
    step: int = Field(ge=1, le=4)
    latitude: Latitude
    longitude: Longitude
    radius_m: int = Field(ge=1, le=10000)
    reviewed_safe: Literal[True]

    @model_validator(mode="after")
    def non_placeholder(self):
        if self.latitude == 0 and self.longitude == 0:
            raise ValueError("Development placeholder is not a reviewed field checkpoint")
        return self


class Checkpoints(Input):
    checkpoints: list[Checkpoint] = Field(min_length=4, max_length=4)

    @model_validator(mode="after")
    def four_steps(self):
        if sorted(p.step for p in self.checkpoints) != [1, 2, 3, 4]:
            raise ValueError("Provide each FIELD TEST step exactly once")
        return self


async def seed_field_test(
    db: AsyncSession, *, development: bool, checkpoints: Checkpoints | None = None
) -> None:
    await seed(db, development=development)
    # Same advisory lock as the base seed, held until this whole transaction commits.
    await db.execute(text("SELECT pg_advisory_xact_lock(719902101)"))
    season = await db.scalar(select(Season).where(Season.slug == "yerevan-season-zero"))
    quests = []
    for step, place in enumerate(PLACES, 1):
        slug = f"field-test-zero-{step}"
        quest = await db.scalar(select(Quest).where(Quest.slug == slug).with_for_update())
        if quest is None:
            quest = Quest(
                city_id=season.city_id,
                season_id=season.id,
                slug=slug,
                title=place,
                description=(
                    f"Walk to the operator-reviewed public checkpoint at {place}. "
                    "Use crossings and public paths. Tap CHECK IN, then enter the test code "
                    "provided by the operator. "
                    "This is an engine test, not a riddle. Walk; do not rush."
                ),
                place_label=place,
                base_xp=250,
                field_test_step=step,
                answer_text=f"ZERO{step}",
                answer_hint="Engine test code: ZERO2. Enter it after GPS verification."
                if step == 2
                else None,
                latitude=None,
                longitude=None,
                radius_m=None,
                is_active=False,
            )
            db.add(quest)
            await db.flush()
        if quest.field_test_step != step or quest.season_id != season.id:
            raise ValueError(f"Existing {slug} conflicts with FIELD TEST 0; review manually")
        quests.append(quest)
    if checkpoints is not None:
        ids = [q.id for q in quests]
        if await db.scalar(select(QuestRun.id).where(QuestRun.quest_id.in_(ids)).limit(1)):
            raise ValueError("FIELD TEST has runs; checkpoint reconfiguration is not supported")
        by_step = {p.step: p for p in checkpoints.checkpoints}
        for quest in quests:
            point = by_step[quest.field_test_step]
            quest.latitude = point.latitude
            quest.longitude = point.longitude
            quest.radius_m = point.radius_m
            quest.is_active = True
    await db.flush()


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--checkpoints", type=Path, help="Reviewed JSON; atomically enables four quests"
    )
    args = parser.parse_args()
    points = (
        Checkpoints.model_validate(json.loads(args.checkpoints.read_text()))
        if args.checkpoints
        else None
    )
    try:
        async with SessionFactory.begin() as db:
            await seed_field_test(
                db, development=get_settings().environment == "development", checkpoints=points
            )
        print(
            "FIELD TEST 0 ready. Existing content preserved unless reviewed checkpoints supplied."
        )
        print("Before walking: inspect all four checkpoints, season dates and active quest list.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
