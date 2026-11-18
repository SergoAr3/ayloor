"""Opt-in, immutable synthetic demo. Never installs itself on app startup."""

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import SessionFactory
from app.models import Guide
from app.publish_guide import GuideSpec, StopSpec, publish

DEMO_SLUG = "explore-demo-v1"


async def seed(db: AsyncSession) -> Guide:
    stops = []
    for position, title, clue, answer, hint, reveal in [
        (
            1,
            "Notice a word",
            "Demo card: LOOK CLOSER. What is the second word?",
            "closer",
            "Read the word after LOOK.",
            "CLOSER is the second word. This is a synthetic Reveal.",
        ),
        (
            2,
            "Notice a shape",
            "Demo card: △. How many sides does this shape have?",
            "3",
            "Count the three straight edges; enter a digit.",
            "A triangle has three sides. You have reached the last demo stop.",
        ),
    ]:
        stops.append(
            StopSpec(
                position=position,
                title=title,
                clue=clue,
                answer=answer,
                hint=hint,
                reveal=reveal,
            )
        )
    return await publish(
        db,
        GuideSpec(
            slug=DEMO_SLUG,
            title="Explore flow demo",
            description="Two synthetic steps to test the flow. Not a real city walk or Yerevan guide.",
            stops=stops,
        ),
    )


async def main() -> None:
    async with SessionFactory.begin() as db:
        await seed(db)
    print("Explore synthetic demo available; no multiplayer content changed.")


if __name__ == "__main__":
    asyncio.run(main())
