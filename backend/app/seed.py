"""Idempotent development seed. Run: python -m app.seed."""

import asyncio
from datetime import timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import SessionFactory, engine
from app.models import City, Quest, QuestType, Season, SeasonStatus, VerificationLevel, utcnow


async def seed(db: AsyncSession, *, development: bool) -> None:
    # Serialize even concurrent CLI invocations, without introducing another service.
    await db.execute(text("SELECT pg_advisory_xact_lock(719902101)"))
    city = await db.scalar(select(City).where(City.slug == "yerevan"))
    if city is None:
        city = City(slug="yerevan", name="Yerevan", country_code="AM", timezone="Asia/Yerevan")
        db.add(city)
        await db.flush()
    season = await db.scalar(select(Season).where(Season.slug == "yerevan-season-zero"))
    if season is None:
        now = utcnow()
        season = Season(
            city_id=city.id,
            name="AYLOOR YEREVAN — SEASON ZERO",
            slug="yerevan-season-zero",
            starts_at=now - timedelta(minutes=1),
            ends_at=now + timedelta(days=14),
            status=SeasonStatus.active,
        )
        db.add(season)
        await db.flush()
    quest = await db.scalar(select(Quest).where(Quest.slug == "first-checkpoint"))
    if quest is None:
        # TODO: replace with verified Yerevan Season Zero checkpoint
        db.add(
            Quest(
                city_id=city.id,
                season_id=season.id,
                slug="first-checkpoint",
                title="First Checkpoint",
                description="Reach the first AYLOOR checkpoint and check in with your team.",
                quest_type=QuestType.location,
                verification_level=VerificationLevel.system,
                base_xp=100,
                latitude=0,
                longitude=0,
                radius_m=100,
                is_active=development,
                rules_json={"development_placeholder": True},
            )
        )
    await db.flush()


async def main():
    try:
        async with SessionFactory.begin() as db:
            await seed(db, development=get_settings().environment == "development")
        print("Seed ready: Yerevan / Season Zero / First Checkpoint (existing records preserved).")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
