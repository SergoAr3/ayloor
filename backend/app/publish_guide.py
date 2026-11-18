"""Validate and atomically publish one immutable Explore version from private JSON."""

import argparse
import asyncio
import json
from pathlib import Path
from typing import Annotated, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationError,
    model_validator,
)
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Guide, GuideStop, utcnow


def database_text(value: str) -> str:
    if "\x00" in value:
        raise ValueError("Text cannot contain NUL")
    value.encode("utf-8")
    return value


Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=100)]
Title = Annotated[
    str,
    StringConstraints(min_length=1, max_length=255, pattern=r"\S"),
    AfterValidator(database_text),
]
Content = Annotated[
    str,
    StringConstraints(min_length=1, max_length=10000, pattern=r"\S"),
    AfterValidator(database_text),
]


class StopSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)

    position: int = Field(ge=1, le=50)
    title: Title
    clue: Content
    answer: Annotated[
        str,
        StringConstraints(min_length=1, max_length=200, pattern=r"\S"),
        AfterValidator(database_text),
    ]
    hint: Content
    reveal: Content
    directions: Content | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    radius_m: float | None = Field(default=None, gt=0)
    max_accuracy_m: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def complete_checkpoint(self) -> Self:
        values = (self.latitude, self.longitude, self.radius_m, self.max_accuracy_m)
        if any(v is not None for v in values) and (
            any(v is None for v in values) or self.directions is None
        ):
            raise ValueError("Checkpoint requires coordinates, radius, accuracy and directions")
        return self


class GuideSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    slug: Slug
    title: Title
    description: Content
    stops: list[StopSpec] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def ordered_stops(self) -> Self:
        if [s.position for s in self.stops] != list(range(1, len(self.stops) + 1)):
            raise ValueError("Stops must be ordered with consecutive positions starting at 1")
        return self


class PublicationConflict(ValueError):
    pass


def reject_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def read_spec(path: Path) -> GuideSpec:
    # Bound input before parsing; no remote fetch and no validation output containing answers.
    with path.open("rb") as source:
        raw = source.read(1_000_001)
    if len(raw) > 1_000_000:
        raise ValueError("Guide JSON exceeds 1 MB")
    data = json.loads(raw.decode("utf-8"), object_pairs_hook=reject_duplicate_keys)
    return GuideSpec.model_validate(data)


async def publish(db: AsyncSession, spec: GuideSpec) -> Guide:
    # Revalidate even programmatically constructed input before any database mutation.
    spec = GuideSpec.model_validate(spec.model_dump())
    # Small operator-only workflow; a single transaction lock avoids concurrent first
    # inserts and content conflicts without a separate version/catalogue service.
    await db.execute(text("SELECT pg_advisory_xact_lock(41004002)"))
    guide = await db.scalar(select(Guide).where(Guide.slug == spec.slug).with_for_update())
    if guide is not None:
        stops = list(
            (
                await db.scalars(
                    select(GuideStop)
                    .where(GuideStop.guide_id == guide.id)
                    .order_by(GuideStop.position)
                )
            ).all()
        )
        existing = {
            "slug": guide.slug,
            "title": guide.title,
            "description": guide.description,
            "stops": [
                {field: getattr(stop, field) for field in StopSpec.model_fields} for stop in stops
            ],
        }
        if existing != spec.model_dump():
            raise PublicationConflict("This version already has different content; use a new slug")
        # No upsert/replace mode, including for an existing draft with different content.
        if guide.published_at is None:
            guide.published_at = utcnow()
            await db.flush()
        return guide
    guide = Guide(slug=spec.slug, title=spec.title, description=spec.description)
    db.add(guide)
    await db.flush()
    db.add_all(GuideStop(guide_id=guide.id, **stop.model_dump()) for stop in spec.stops)
    await db.flush()
    guide.published_at = utcnow()
    await db.flush()
    return guide


async def import_file(spec: GuideSpec) -> None:
    from app.db.session import SessionFactory, engine

    try:
        async with SessionFactory.begin() as db:
            await publish(db, spec)
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--check", action="store_true", help="Validate only; no database access")
    args = parser.parse_args()
    try:
        spec = read_spec(args.file)
    except ValidationError as error:
        # Avoid echoing private answers or document contents on validation failure.
        locations = ", ".join(".".join(map(str, e["loc"])) or "guide" for e in error.errors())
        parser.exit(2, f"Invalid guide fields: {locations}\n")
    except (OSError, ValueError, UnicodeError):
        parser.exit(2, "Unable to read a valid guide JSON file (UTF-8, maximum 1 MB).\n")
    if args.check:
        print(f"Valid guide: {spec.slug} ({len(spec.stops)} stops). Nothing published.")
        return
    try:
        asyncio.run(import_file(spec))
    except PublicationConflict as error:
        parser.exit(2, f"Publication refused: {error}\n")
    except Exception:  # noqa: BLE001 - CLI boundary must not print private SQL/content/config
        parser.exit(
            1,
            "Publication could not be confirmed. Check database/configuration; identical retries are safe.\n",
        )
    print(f"Published: {spec.slug}. Entry: /explore.html?guide={spec.slug}")


if __name__ == "__main__":
    main()
