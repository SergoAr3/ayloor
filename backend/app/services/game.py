import math
import re
import secrets
from datetime import timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import (
    Base,
    City,
    Invite,
    MemberRole,
    Quest,
    QuestRun,
    QuestType,
    RunStatus,
    ScoreEvent,
    Season,
    SeasonStatus,
    Submission,
    SubmissionStatus,
    SubmissionType,
    Team,
    TeamMember,
    TeamStatus,
    User,
    VerificationLevel,
    utcnow,
)
from app.schemas.api import (
    CheckInInput,
    CompletionOut,
    InviteInput,
    InviteOut,
    LeaderboardOut,
    QuestOut,
    RankingEntry,
    RunOut,
    TeamInput,
    TeamOut,
)


async def require_city(db: AsyncSession, slug: str) -> City:
    city = await db.scalar(select(City).where(City.slug == slug, City.is_active.is_(True)))
    if city is None:
        raise HTTPException(404, "Active city not found")
    return city


async def current_season(db: AsyncSession, city_id: UUID) -> Season | None:
    now = utcnow()
    return await db.scalar(
        select(Season).where(
            Season.city_id == city_id,
            Season.status == SeasonStatus.active,
            Season.starts_at <= now,
            Season.ends_at > now,
        )
    )


async def membership(db: AsyncSession, user_id: UUID, city_id: UUID) -> TeamMember | None:
    return await db.scalar(
        select(TeamMember).where(
            TeamMember.user_id == user_id,
            TeamMember.city_id == city_id,
            TeamMember.released_at.is_(None),
        )
    )


async def lock_row[Model: Base](db: AsyncSession, model: type[Model], row_id: UUID) -> Model:
    row = await db.scalar(
        select(model)
        .where(model.id == row_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if row is None:
        raise HTTPException(404, "Record not found")
    return row


async def member_count(db: AsyncSession, team_id: UUID) -> int:
    return int(
        await db.scalar(
            select(func.count())
            .select_from(TeamMember)
            .where(
                TeamMember.team_id == team_id,
                TeamMember.released_at.is_(None),
            )
        )
        or 0
    )


async def team_output(db: AsyncSession, team: Team) -> TeamOut:
    return TeamOut(
        id=team.id,
        city_id=team.city_id,
        name=team.name,
        slug=team.slug,
        captain_user_id=team.captain_user_id,
        status=team.status,
        member_count=await member_count(db, team.id),
    )


async def require_member_team(
    db: AsyncSession, user_id: UUID, team_id: UUID, *, lock: bool = False
) -> Team:
    team = await lock_row(db, Team, team_id) if lock else await db.get(Team, team_id)
    if team is None:
        raise HTTPException(404, "Team not found")
    member = await membership(db, user_id, team.city_id)
    if member is None or member.team_id != team.id or team.status == TeamStatus.blocked:
        raise HTTPException(403, "You are not a current member of this team")
    return team


async def create_team(db: AsyncSession, user: User, data: TeamInput) -> TeamOut:
    city = await require_city(db, data.city_slug)
    await lock_row(db, User, user.id)
    if await membership(db, user.id, city.id):
        raise HTTPException(409, "You already belong to a pending or active team in this city")
    prefix = re.sub(r"[^a-z0-9]+", "-", data.name.lower()).strip("-")[:60] or "team"
    team = Team(
        city_id=city.id,
        name=data.name,
        slug=f"{prefix}-{uuid4().hex[:12]}",
        captain_user_id=user.id,
        status=TeamStatus.pending,
    )
    db.add(team)
    await db.flush()
    db.add(TeamMember(team_id=team.id, city_id=city.id, user_id=user.id, role=MemberRole.captain))
    await db.flush()
    return await team_output(db, team)


def check_invite(invite: Invite, team: Team) -> None:
    if invite.expires_at is not None and invite.expires_at <= utcnow():
        raise HTTPException(410, "Invite has expired")
    if invite.max_uses is not None and invite.uses >= invite.max_uses:
        raise HTTPException(409, "Invite has no uses remaining")
    if team.status == TeamStatus.blocked:
        raise HTTPException(403, "Team is blocked")


async def invite_output(db: AsyncSession, invite: Invite, settings: Settings) -> InviteOut:
    team = await db.get(Team, invite.team_id)
    if team is None:
        raise HTTPException(404, "Team not found")
    check_invite(invite, team)
    return InviteOut(
        code=invite.code,
        team=await team_output(db, team),
        expires_at=invite.expires_at,
        remaining_uses=None if invite.max_uses is None else invite.max_uses - invite.uses,
        link=f"https://t.me/{settings.telegram_bot_username}?start=join_{invite.code}"
        if settings.telegram_bot_username
        else None,
    )


async def create_invite(
    db: AsyncSession, user: User, team_id: UUID, data: InviteInput, settings: Settings
) -> InviteOut:
    team = await require_member_team(db, user.id, team_id, lock=True)
    if await member_count(db, team.id) >= 5:
        raise HTTPException(409, "Team is full")
    invite = Invite(
        team_id=team.id,
        created_by=user.id,
        code=secrets.token_urlsafe(18),
        expires_at=utcnow() + timedelta(hours=data.expires_in_hours),
        max_uses=data.max_uses,
    )
    db.add(invite)
    await db.flush()
    return await invite_output(db, invite, settings)


async def require_invite(db: AsyncSession, code: str) -> Invite:
    invite = await db.scalar(select(Invite).where(Invite.code == code))
    if invite is None:
        raise HTTPException(404, "Invite not found")
    return invite


async def join_team(db: AsyncSession, user: User, code: str) -> TeamOut:
    invite = await require_invite(db, code)
    # All membership mutations serialize on user, then team, then invite.
    await lock_row(db, User, user.id)
    team = await lock_row(db, Team, invite.team_id)
    invite = await lock_row(db, Invite, invite.id)
    check_invite(invite, team)
    if await membership(db, user.id, team.city_id):
        raise HTTPException(409, "You already belong to a pending or active team in this city")
    if await member_count(db, team.id) >= 5:
        raise HTTPException(409, "Team is full")
    db.add(
        TeamMember(team_id=team.id, city_id=team.city_id, user_id=user.id, role=MemberRole.member)
    )
    invite.uses += 1
    team.status = TeamStatus.active
    await db.flush()
    return await team_output(db, team)


async def validate_quest(db: AsyncSession, quest: Quest, team: Team) -> Season:
    now = utcnow()
    if team.status != TeamStatus.active:
        raise HTTPException(409, "Team must be active")
    city = await db.get(City, team.city_id)
    if city is None or not city.is_active or quest.city_id != team.city_id or not quest.is_active:
        raise HTTPException(409, "Quest is not available in your city")
    if (
        quest.quest_type != QuestType.location
        or quest.verification_level != VerificationLevel.system
    ):
        raise HTTPException(409, "Only system-verified location quests are available in v0.1")
    if (quest.starts_at and quest.starts_at > now) or (
        quest.expires_at and quest.expires_at <= now
    ):
        raise HTTPException(409, "Quest is outside its availability interval")
    season = await current_season(db, team.city_id)
    if season is None or (quest.season_id is not None and quest.season_id != season.id):
        raise HTTPException(409, "Quest has no current active season")
    if quest.latitude is None or quest.longitude is None or quest.radius_m is None:
        raise HTTPException(409, "Quest checkpoint is not configured")
    if (quest.rules_json or {}).get("development_placeholder") and db.info.get("production", False):
        raise HTTPException(409, "Development checkpoint is unavailable in production")
    return season


async def quest_output(db: AsyncSession, quest: Quest, user: User) -> QuestOut:
    member = await membership(db, user.id, quest.city_id)
    run = (
        None
        if member is None
        else await db.scalar(
            select(QuestRun).where(
                QuestRun.quest_id == quest.id,
                QuestRun.team_id == member.team_id,
            )
        )
    )
    return QuestOut(
        id=quest.id,
        title=quest.title,
        description=quest.description,
        base_xp=quest.base_xp,
        latitude=float(quest.latitude) if quest.latitude is not None else None,
        longitude=float(quest.longitude) if quest.longitude is not None else None,
        radius_m=quest.radius_m,
        starts_at=quest.starts_at,
        expires_at=quest.expires_at,
        run=RunOut.model_validate(run) if run else None,
    )


async def available_quests(db: AsyncSession, city: City) -> list[Quest]:
    season = await current_season(db, city.id)
    if season is None:
        return []
    now = utcnow()
    query = (
        select(Quest)
        .where(
            Quest.city_id == city.id,
            Quest.is_active.is_(True),
            or_(Quest.season_id == season.id, Quest.season_id.is_(None)),
            or_(Quest.starts_at.is_(None), Quest.starts_at <= now),
            or_(Quest.expires_at.is_(None), Quest.expires_at > now),
            Quest.quest_type == QuestType.location,
            Quest.verification_level == VerificationLevel.system,
        )
        .order_by(Quest.created_at, Quest.id)
    )
    quests = list((await db.scalars(query)).all())
    if db.info.get("production", False):
        quests = [q for q in quests if not (q.rules_json or {}).get("development_placeholder")]
    return quests


async def start_quest(db: AsyncSession, user: User, quest_id: UUID) -> RunOut:
    quest = await db.get(Quest, quest_id)
    if quest is None:
        raise HTTPException(404, "Quest not found")
    member = await membership(db, user.id, quest.city_id)
    if member is None:
        raise HTTPException(403, "Join a team first")
    team = await require_member_team(db, user.id, member.team_id, lock=True)
    quest = await lock_row(db, Quest, quest.id)
    await validate_quest(db, quest, team)
    if await db.scalar(
        select(QuestRun.id).where(QuestRun.team_id == team.id, QuestRun.quest_id == quest.id)
    ):
        raise HTTPException(409, "This team has already started or completed this quest")
    run = QuestRun(quest_id=quest.id, team_id=team.id)
    db.add(run)
    await db.flush()
    return RunOut.model_validate(run)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(min(1.0, max(0.0, a))))


async def check_in(
    db: AsyncSession, user: User, run_id: UUID, data: CheckInInput, settings: Settings
) -> CompletionOut:
    run = await db.get(QuestRun, run_id)
    if run is None:
        raise HTTPException(404, "Quest run not found")
    team = await require_member_team(db, user.id, run.team_id, lock=True)
    quest = await lock_row(db, Quest, run.quest_id)
    run = await lock_row(db, QuestRun, run.id)
    if run.status == RunStatus.completed:
        return CompletionOut(run=RunOut.model_validate(run), awarded_xp=0, already_completed=True)
    if run.status != RunStatus.started:
        raise HTTPException(409, "Quest run is not started")
    season = await validate_quest(db, quest, team)
    if data.horizontal_accuracy > settings.max_acceptable_gps_accuracy_m:
        raise HTTPException(422, "GPS accuracy is too low; retry with a clearer view of the sky")
    distance = haversine_m(
        data.latitude, data.longitude, float(quest.latitude), float(quest.longitude)
    )
    if distance > quest.radius_m:
        raise HTTPException(422, "You are outside the checkpoint radius")
    db.add(
        Submission(
            quest_run_id=run.id,
            user_id=user.id,
            submission_type=SubmissionType.location,
            latitude=data.latitude,
            longitude=data.longitude,
            horizontal_accuracy=data.horizontal_accuracy,
            status=SubmissionStatus.accepted,
        )
    )
    run.status = RunStatus.completed
    run.completed_at = utcnow()
    db.add(
        ScoreEvent(
            season_id=season.id,
            team_id=team.id,
            user_id=user.id,
            quest_run_id=run.id,
            amount=quest.base_xp,
            reason="quest_completion",
        )
    )
    await db.flush()
    return CompletionOut(
        run=RunOut.model_validate(run), awarded_xp=quest.base_xp, already_completed=False
    )


async def leaderboard(db: AsyncSession, user: User, city: City) -> LeaderboardOut:
    season = await current_season(db, city.id)
    member = await membership(db, user.id, city.id)
    entries: list[RankingEntry] = []
    if season is not None:
        totals = (
            select(ScoreEvent.team_id, func.sum(ScoreEvent.amount).label("xp"))
            .where(ScoreEvent.season_id == season.id)
            .group_by(ScoreEvent.team_id)
            .subquery()
        )
        xp = func.coalesce(totals.c.xp, 0)
        rows = (
            await db.execute(
                select(Team.id, Team.name, xp.label("xp"))
                .outerjoin(totals, totals.c.team_id == Team.id)
                .where(Team.city_id == city.id, Team.status == TeamStatus.active)
                .order_by(xp.desc(), Team.created_at, Team.id)
            )
        ).all()
        entries = [
            RankingEntry(rank=i, team_id=row.id, team_name=row.name, xp=int(row.xp))
            for i, row in enumerate(rows, 1)
        ]
    own = next((entry for entry in entries if member and entry.team_id == member.team_id), None)
    return LeaderboardOut(
        entries=entries,
        current_user_team_rank=own.rank if own else None,
        current_user_team_xp=own.xp if own else None,
        xp_to_next_rank=entries[own.rank - 2].xp - own.xp + 1 if own and own.rank > 1 else None,
    )
