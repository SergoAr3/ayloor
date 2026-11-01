"""Run-scoped Explore API. Credentials never authorize multiplayer endpoints."""

import hashlib
import hmac
import re
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, SecretStr
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import DB, Config
from app.models import ExploreRun, Guide, GuideStop, utcnow
from app.services.game import haversine_m

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


class ArrivalInput(StepInput):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    accuracy_m: float = Field(ge=0, allow_inf_nan=False)
    captured_at: AwareDatetime


class CheckpointOut(BaseModel):
    latitude: float
    longitude: float
    radius_m: float
    max_accuracy_m: float


class ArrivalState(BaseModel):
    status: Literal["not_configured", "unconfirmed", "confirmed"]
    confirmed_at: datetime | None


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
    directions: str | None
    checkpoint: CheckpointOut | None


class RunOut(BaseModel):
    id: UUID
    guide: GuideOut
    phase: Literal["clue", "reveal", "finished"]
    stop: StopOut
    arrival: ArrivalState


class StartOut(BaseModel):
    credential: str
    run: RunOut


class AnswerOut(BaseModel):
    accepted: bool
    run: RunOut


class ArrivalOut(BaseModel):
    outcome: Literal["confirmed", "low_accuracy", "uncertain", "outside", "stale_sample"]
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
        arrival=ArrivalState(
            status=(
                "not_configured"
                if stop.latitude is None
                else "confirmed"
                if run.arrived_stop_id == stop.id
                else "unconfirmed"
            ),
            confirmed_at=run.arrived_at if run.arrived_stop_id == stop.id else None,
        ),
        stop=StopOut(
            id=stop.id,
            position=stop.position,
            title=stop.title,
            clue=stop.clue,
            directions=stop.directions,
            checkpoint=CheckpointOut(
                latitude=stop.latitude,
                longitude=stop.longitude,
                radius_m=stop.radius_m,
                max_accuracy_m=stop.max_accuracy_m,
            )
            if stop.latitude is not None
            else None,
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


@router.post("/runs/{run_id}/arrival", response_model=ArrivalOut)
async def arrival(data: ArrivalInput, db: DB, run: OwnedRun):
    stop = await expected_stop(db, run, data.stop_id)
    if stop.position != run.position or run.phase == "finished":
        raise HTTPException(409, "Arrival is only available for the current unfinished stop")
    if stop.latitude is None:
        raise HTTPException(409, "This stop has no checkpoint")
    # Lock held by owned_run: retries preserve the first server timestamp. Samples
    # are never stored, including failed attempts. Confirmation is historical.
    outcome = "confirmed"
    if run.arrived_stop_id != stop.id:
        now = utcnow()
        age = (now - data.captured_at).total_seconds()
        distance = haversine_m(data.latitude, data.longitude, stop.latitude, stop.longitude)
        if not -30 <= age <= 120:
            outcome = "stale_sample"
        elif data.accuracy_m > stop.max_accuracy_m:
            outcome = "low_accuracy"
        elif distance + data.accuracy_m <= stop.radius_m:
            run.arrived_stop_id = stop.id
            run.arrived_at = now
            await db.flush()
        elif distance - data.accuracy_m > stop.radius_m:
            outcome = "outside"
        else:
            outcome = "uncertain"
    return ArrivalOut(outcome=outcome, run=await snapshot(db, run))


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
        run.arrived_stop_id = None
        run.arrived_at = None
        if run.position == len(stops):
            run.phase = "finished"
        else:
            run.position += 1
            run.phase = "clue"
        await db.flush()
    return await snapshot(db, run)
