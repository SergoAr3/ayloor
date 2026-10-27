"""The fixed FIELD TEST 0 route. No generic campaign or branching engine."""

from datetime import timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    City,
    Quest,
    QuestRun,
    RunStatus,
    ScoreEvent,
    Submission,
    SubmissionStatus,
    SubmissionType,
    Team,
    User,
    utcnow,
)
from app.schemas.api import AnswerInput, FieldActionOut, FieldTestOut
from app.services import game

DURATION_SECONDS = 90 * 60
HINT_PENALTY = 50
WRONG_PENALTY = 25


async def route_quests(db: AsyncSession, season_id: UUID) -> list[Quest]:
    return list(
        (
            await db.scalars(
                select(Quest)
                .where(Quest.season_id == season_id, Quest.field_test_step.is_not(None))
                .order_by(Quest.field_test_step)
            )
        ).all()
    )


async def route_runs(db: AsyncSession, team_id: UUID, season_id: UUID) -> list[QuestRun]:
    return list(
        (
            await db.scalars(
                select(QuestRun)
                .join(Quest, Quest.id == QuestRun.quest_id)
                .where(
                    QuestRun.team_id == team_id,
                    Quest.season_id == season_id,
                    Quest.field_test_step.is_not(None),
                )
                .order_by(Quest.field_test_step)
            )
        ).all()
    )


async def require_next(db: AsyncSession, quest: Quest, team: Team) -> None:
    quests = await route_quests(db, quest.season_id)
    if [q.field_test_step for q in quests] != [1, 2, 3, 4]:
        raise HTTPException(409, "FIELD TEST 0 route is not configured")
    runs = {r.quest_id: r for r in await route_runs(db, team.id, quest.season_id)}
    for previous in quests[: quest.field_test_step - 1]:
        if previous.id not in runs or runs[previous.id].status != RunStatus.completed:
            raise HTTPException(409, "Complete the previous FIELD TEST quest first")
    first = runs.get(quests[0].id)
    if first and utcnow() >= first.started_at + timedelta(seconds=DURATION_SECONDS):
        raise HTTPException(409, "FIELD TEST 0 has expired")
    if first is None:
        # Do not consume the timer while another checkpoint is unconfigured,
        # inactive, outside its window or a production development placeholder.
        for checkpoint in quests:
            await game.validate_quest(db, checkpoint, team)


async def quest_state(
    db: AsyncSession, quest: Quest, run: QuestRun | None, team_id: UUID | None
) -> dict:
    quests = await route_quests(db, quest.season_id)
    runs = (
        {}
        if team_id is None
        else {r.quest_id: r for r in await route_runs(db, team_id, quest.season_id)}
    )
    first = runs.get(quests[0].id) if quests else None
    expired = bool(first and utcnow() >= first.started_at + timedelta(seconds=DURATION_SECONDS))
    previous_done = all(
        q.id in runs and runs[q.id].status == RunStatus.completed
        for q in quests
        if q.field_test_step < quest.field_test_step
    )
    reasons = (
        set()
        if run is None
        else set(
            (
                await db.scalars(select(ScoreEvent.reason).where(ScoreEvent.quest_run_id == run.id))
            ).all()
        )
    )
    hint_used = "hint_penalty" in reasons
    return {
        "field_test_step": quest.field_test_step,
        "locked": not (run and run.status == RunStatus.completed)
        and (expired or not previous_done or [q.field_test_step for q in quests] != [1, 2, 3, 4]),
        "hint_available": quest.field_test_step == 2 and bool(quest.answer_hint),
        "hint_used": hint_used,
        "hint_text": quest.answer_hint if hint_used else None,
        "wrong_answer_penalized": "wrong_answer_penalty" in reasons,
    }


async def summary(db: AsyncSession, user: User, city: City) -> FieldTestOut | None:
    season = await game.current_season(db, city.id)
    if season is None:
        return None
    quests = await route_quests(db, season.id)
    if not quests:
        return None
    member = await game.membership(db, user.id, city.id)
    runs = []
    if member:
        await game.require_member_team(db, user.id, member.team_id, lock=True)
        runs = await route_runs(db, member.team_id, season.id)
    now = utcnow()
    by_quest = {r.quest_id: r for r in runs}
    first_quest = next((q for q in quests if q.field_test_step == 1), None)
    last_quest = next((q for q in quests if q.field_test_step == 4), None)
    first = by_quest.get(first_quest.id) if first_quest else None
    last = by_quest.get(last_quest.id) if last_quest else None
    started = first.started_at if first else None
    deadline = started + timedelta(seconds=DURATION_SECONDS) if started else None
    finished = last.completed_at if last else None
    elapsed = (
        0
        if started is None
        else max(0, min(DURATION_SECONDS, int(((finished or now) - started).total_seconds())))
    )
    score = (
        int(
            await db.scalar(
                select(func.coalesce(func.sum(ScoreEvent.amount), 0)).where(
                    ScoreEvent.quest_run_id.in_([r.id for r in runs])
                )
            )
            or 0
        )
        if runs
        else 0
    )
    board = await game.leaderboard(db, user, city)
    return FieldTestOut(
        status="finished"
        if finished
        else "expired"
        if deadline and now >= deadline
        else "running"
        if started
        else "ready",
        server_now=now,
        started_at=started,
        deadline_at=deadline,
        finished_at=finished,
        elapsed_seconds=elapsed,
        remaining_seconds=DURATION_SECONDS - elapsed,
        score=score,
        completed_quests=sum(r.status == RunStatus.completed for r in runs),
        leaderboard_position=board.current_user_team_rank,
    )


async def locked_run(db: AsyncSession, user: User, run_id: UUID) -> tuple[Team, Quest, QuestRun]:
    run = await db.get(QuestRun, run_id)
    if run is None:
        raise HTTPException(404, "Quest run not found")
    team = await game.require_member_team(db, user.id, run.team_id, lock=True)
    quest = await game.lock_row(db, Quest, run.quest_id)
    run = await game.lock_row(db, QuestRun, run.id)
    if quest.field_test_step is None:
        raise HTTPException(409, "This action is only available in FIELD TEST 0")
    return team, quest, run


async def require_action(db: AsyncSession, team: Team, quest: Quest, run: QuestRun) -> None:
    if run.status != RunStatus.started:
        raise HTTPException(409, "Quest run is not started")
    await game.validate_quest(db, quest, team)
    await require_next(db, quest, team)
    if run.gps_verified_at is None:
        raise HTTPException(409, "Verify GPS with CHECK IN before answering or revealing a hint")


async def penalty(db: AsyncSession, user: User, quest: Quest, run: QuestRun, reason: str) -> bool:
    if await db.scalar(
        select(ScoreEvent.id).where(ScoreEvent.quest_run_id == run.id, ScoreEvent.reason == reason)
    ):
        return False
    db.add(
        ScoreEvent(
            season_id=quest.season_id,
            team_id=run.team_id,
            user_id=user.id,
            quest_run_id=run.id,
            amount=-HINT_PENALTY if reason == "hint_penalty" else -WRONG_PENALTY,
            reason=reason,
        )
    )
    await db.flush()
    return True


async def reveal_hint(db: AsyncSession, user: User, run_id: UUID) -> FieldActionOut:
    team, quest, run = await locked_run(db, user, run_id)
    if quest.field_test_step != 2 or not quest.answer_hint:
        raise HTTPException(409, "This quest has no paid hint")
    used = await db.scalar(
        select(ScoreEvent.id).where(
            ScoreEvent.quest_run_id == run.id, ScoreEvent.reason == "hint_penalty"
        )
    )
    if used:
        return FieldActionOut(quest=await game.quest_output(db, quest, user), already_applied=True)
    await require_action(db, team, quest, run)
    await penalty(db, user, quest, run, "hint_penalty")
    return FieldActionOut(quest=await game.quest_output(db, quest, user), penalty_xp=HINT_PENALTY)


async def answer(db: AsyncSession, user: User, run_id: UUID, data: AnswerInput) -> FieldActionOut:
    team, quest, run = await locked_run(db, user, run_id)
    if run.status == RunStatus.completed:
        return FieldActionOut(
            quest=await game.quest_output(db, quest, user), correct=True, already_applied=True
        )
    await require_action(db, team, quest, run)
    correct = data.answer.strip().upper() == quest.answer_text.strip().upper()
    if not correct:
        applied = await penalty(db, user, quest, run, "wrong_answer_penalty")
        # Retried wrong answers do not create an unbounded submission history.
        if applied:
            db.add(
                Submission(
                    quest_run_id=run.id,
                    user_id=user.id,
                    submission_type=SubmissionType.answer,
                    answer=data.answer,
                    status=SubmissionStatus.rejected,
                )
            )
        await db.flush()
        return FieldActionOut(
            quest=await game.quest_output(db, quest, user),
            correct=False,
            penalty_xp=WRONG_PENALTY if applied else 0,
            already_applied=not applied,
        )
    db.add(
        Submission(
            quest_run_id=run.id,
            user_id=user.id,
            submission_type=SubmissionType.answer,
            answer=data.answer,
            status=SubmissionStatus.accepted,
        )
    )
    run.status = RunStatus.completed
    run.completed_at = utcnow()
    db.add(
        ScoreEvent(
            season_id=quest.season_id,
            team_id=team.id,
            user_id=user.id,
            quest_run_id=run.id,
            amount=quest.base_xp,
            reason="quest_completion",
        )
    )
    await db.flush()
    return FieldActionOut(
        quest=await game.quest_output(db, quest, user), correct=True, awarded_xp=quest.base_xp
    )
