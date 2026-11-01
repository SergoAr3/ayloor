"""Run-scoped Explore API. Credentials never authorize multiplayer endpoints."""

import hashlib
import hmac
import re
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import DB, Config
from app.models import ExploreRun, Guide, GuideStop

bearer = HTTPBearer(auto_error=False)


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StartInput(Input):
    # SecretStr redacts Pydantic representations.
    start_key: SecretStr


class StepInput(Input):
    stop_id: UUID


class AnswerInput(StepInput):
    answer: str = Field(min_length=1, max_length=200)


class GuideOut(BaseModel):
    slug: str
    title: str
    description: str
    stop_count: int


class StopOut(BaseModel):
    id: UUID
    position: int
    title: str
    clue: str
    hint: str | None
    reveal: str | None


class RunOut(BaseModel):
    id: UUID
    guide: GuideOut
    phase: Literal["clue", "reveal", "finished"]
    stop: StopOut


class StartOut(BaseModel):
    credential: str
    run: RunOut


class AnswerOut(BaseModel):
    accepted: bool
    run: RunOut


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(prefix="/api/v1/explore", tags=["explore"], dependencies=[Depends(no_store)])


async def stops_for(db: AsyncSession, guide_id: UUID) -> list[GuideStop]:
    return list(
        (
            await db.scalars(
                select(GuideStop).where(GuideStop.guide_id == guide_id).order_by(GuideStop.position)
            )
        ).all()
    )


async def snapshot(db: AsyncSession, run: ExploreRun) -> RunOut:
    guide = await db.get(Guide, run.guide_id)
    stops = await stops_for(db, run.guide_id)
    stop = next(s for s in stops if s.position == run.position)
    return RunOut(
        id=run.id,
        guide=GuideOut(
            slug=guide.slug, title=guide.title, description=guide.description, stop_count=len(stops)
        ),
        phase=run.phase,
        stop=StopOut(
            id=stop.id,
            position=stop.position,
            title=stop.title,
            clue=stop.clue,
            hint=stop.hint if stop.position in run.hinted_positions else None,
            reveal=stop.reveal if run.phase in ("reveal", "finished") else None,
        ),
    )


async def owned_run(
    run_id: UUID,
    db: DB,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> ExploreRun:
    if credentials is None or not re.fullmatch(r"[0-9a-f]{64}", credentials.credentials):
        raise HTTPException(401, "Explore run credential required")
    run = await db.scalar(
        select(ExploreRun)
        .where(
            ExploreRun.id == run_id, ExploreRun.credential_hash == digest(credentials.credentials)
        )
        .with_for_update()
    )
    if run is None:
        raise HTTPException(401, "Explore run credential is invalid")
    return run


OwnedRun = Annotated[ExploreRun, Depends(owned_run)]


async def expected_stop(db: AsyncSession, run: ExploreRun, stop_id: UUID) -> GuideStop:
    stop = await db.get(GuideStop, stop_id)
    if stop is None or stop.guide_id != run.guide_id or stop.position > run.position:
        raise HTTPException(409, "This stop is not available in this run")
    return stop


@router.get("/guides/{slug}", response_model=GuideOut)
async def guide(slug: str, db: DB):
    guide = await db.scalar(select(Guide).where(Guide.slug == slug))
    if guide is None:
        raise HTTPException(404, "Guide is not available")
    stops = await stops_for(db, guide.id)
    if not stops:
        raise HTTPException(409, "Guide has no stops")
    return GuideOut(
        slug=guide.slug, title=guide.title, description=guide.description, stop_count=len(stops)
    )


@router.post("/guides/{slug}/runs", response_model=StartOut)
async def start(slug: str, data: StartInput, db: DB, settings: Config):
    key = data.start_key.get_secret_value()
    if not re.fullmatch(r"[0-9a-f]{64}", key):
        raise HTTPException(422, "Start key must be 32 random bytes encoded as lowercase hex")
    guide = await db.scalar(select(Guide).where(Guide.slug == slug))
    if guide is None:
        raise HTTPException(404, "Guide is not available")
    stops = await stops_for(db, guide.id)
    if not stops or [s.position for s in stops] != list(range(1, len(stops) + 1)):
        raise HTTPException(409, "Guide stops are not configured")
    # A secret, random bootstrap key lets a lost Start response be retried without
    # storing plaintext credentials or creating an anonymous account. Domain-separated
    # HMAC issues the same opaque run token on retry; the server key never leaves here.
    credential = hmac.new(
        settings.app_secret_key.get_secret_value().encode(),
        f"explore-run-v1:{key}".encode(),
        hashlib.sha256,
    ).hexdigest()
    await db.execute(
        insert(ExploreRun)
        .values(
            guide_id=guide.id,
            start_hash=digest(key),
            credential_hash=digest(credential),
            position=1,
            phase="clue",
            hinted_positions=[],
        )
        .on_conflict_do_nothing()
    )
    run = await db.scalar(
        select(ExploreRun).where(ExploreRun.start_hash == digest(key)).with_for_update()
    )
    if run is None or run.guide_id != guide.id or run.credential_hash != digest(credential):
        raise HTTPException(409, "Start cannot be recovered with this key")
    return StartOut(credential=credential, run=await snapshot(db, run))


@router.get("/runs/{run_id}", response_model=RunOut)
async def resume(db: DB, run: OwnedRun):
    return await snapshot(db, run)


@router.post("/runs/{run_id}/hint", response_model=RunOut)
async def hint(data: StepInput, db: DB, run: OwnedRun):
    stop = await expected_stop(db, run, data.stop_id)
    if stop.position == run.position and run.phase != "finished":
        run.hinted_positions = sorted({*run.hinted_positions, stop.position})
        await db.flush()
    return await snapshot(db, run)


@router.post("/runs/{run_id}/answer", response_model=AnswerOut)
async def answer(data: AnswerInput, db: DB, run: OwnedRun):
    stop = await expected_stop(db, run, data.stop_id)
    accepted = stop.position < run.position or run.phase in ("reveal", "finished")
    if not accepted and data.answer.strip().casefold() == stop.answer.strip().casefold():
        run.phase = "reveal"
        accepted = True
        await db.flush()
    return AnswerOut(accepted=accepted, run=await snapshot(db, run))


@router.post("/runs/{run_id}/continue", response_model=RunOut)
async def advance(data: StepInput, db: DB, run: OwnedRun):
    stop = await expected_stop(db, run, data.stop_id)
    if stop.position == run.position and run.phase != "finished":
        if run.phase != "reveal":
            raise HTTPException(409, "Answer this stop before continuing")
        stops = await stops_for(db, run.guide_id)
        if run.position == len(stops):
            run.phase = "finished"
        else:
            run.position += 1
            run.phase = "clue"
        await db.flush()
    return await snapshot(db, run)
