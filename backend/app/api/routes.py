from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert

from app.api.deps import DB, AdminUser, Config, CurrentUser
from app.core.security import create_access_token, validate_init_data
from app.models import (
    Quest,
    ScoreEvent,
    Season,
    Submission,
    Team,
    TeamMember,
    TeamStatus,
    User,
    utcnow,
)
from app.schemas.api import (
    ActiveInput,
    AdjustmentInput,
    AuthInput,
    AuthOut,
    CheckInInput,
    CityOut,
    CompletionOut,
    InviteInput,
    InviteOut,
    LeaderboardOut,
    MemberOut,
    MeOut,
    QuestAdminOut,
    QuestInput,
    QuestOut,
    RunOut,
    ScoreOut,
    SeasonOut,
    SubmissionOut,
    TeamInput,
    TeamOut,
    UserOut,
)
from app.services import game

router = APIRouter(prefix="/api/v1")


@router.get("/config")
async def public_config(settings: Config) -> dict:
    return {"development_gps_enabled": settings.environment == "development"}


@router.post("/auth/telegram", response_model=AuthOut)
async def telegram_auth(data: AuthInput, db: DB, settings: Config) -> AuthOut:
    telegram = validate_init_data(data.init_data, settings)
    profile = telegram.model_dump(exclude={"id"})
    # Concurrent launches of the same Telegram account still create a single user.
    statement = insert(User).values(telegram_id=telegram.id, **profile)
    statement = statement.on_conflict_do_update(
        index_elements=[User.telegram_id],
        set_={**profile, "updated_at": utcnow()},
    ).returning(User)
    user = (await db.scalars(statement)).one()
    return AuthOut(
        access_token=create_access_token(user.id, settings), user=UserOut.model_validate(user)
    )


@router.get("/me", response_model=MeOut)
async def me(db: DB, user: CurrentUser, city: str = "yerevan") -> MeOut:
    selected = await game.require_city(db, city)
    member = await game.membership(db, user.id, selected.id)
    team = await db.get(Team, member.team_id) if member else None
    season = await game.current_season(db, selected.id)
    return MeOut(
        user=UserOut.model_validate(user),
        city=CityOut.model_validate(selected),
        team=await game.team_output(db, team) if team else None,
        season=SeasonOut.model_validate(season) if season else None,
    )


@router.post("/teams", response_model=TeamOut, status_code=201)
async def create_team(data: TeamInput, db: DB, user: CurrentUser) -> TeamOut:
    return await game.create_team(db, user, data)


@router.get("/teams/{team_id}", response_model=TeamOut)
async def get_team(team_id: UUID, db: DB, user: CurrentUser) -> TeamOut:
    return await game.team_output(db, await game.require_member_team(db, user.id, team_id))


@router.get("/teams/{team_id}/members", response_model=list[MemberOut])
async def members(team_id: UUID, db: DB, user: CurrentUser) -> list[MemberOut]:
    await game.require_member_team(db, user.id, team_id)
    rows = (
        await db.execute(
            select(TeamMember, User)
            .join(User, User.id == TeamMember.user_id)
            .where(TeamMember.team_id == team_id, TeamMember.released_at.is_(None))
            .order_by(TeamMember.joined_at, TeamMember.id)
        )
    ).all()
    return [
        MemberOut(user=UserOut.model_validate(person), role=member.role, joined_at=member.joined_at)
        for member, person in rows
    ]


@router.post("/teams/{team_id}/invites", response_model=InviteOut, status_code=201)
async def create_invite(
    team_id: UUID, data: InviteInput, db: DB, user: CurrentUser, settings: Config
) -> InviteOut:
    return await game.create_invite(db, user, team_id, data, settings)


@router.get("/invites/{code}", response_model=InviteOut)
async def get_invite(code: str, db: DB, user: CurrentUser, settings: Config) -> InviteOut:
    return await game.invite_output(db, await game.require_invite(db, code), settings)


@router.post("/invites/{code}/join", response_model=TeamOut)
async def join(code: str, db: DB, user: CurrentUser) -> TeamOut:
    return await game.join_team(db, user, code)


@router.get("/seasons/current", response_model=SeasonOut)
async def season(db: DB, user: CurrentUser, city: str = "yerevan") -> SeasonOut:
    selected = await game.require_city(db, city)
    active = await game.current_season(db, selected.id)
    if active is None:
        raise HTTPException(404, "No current active season")
    return SeasonOut.model_validate(active)


@router.get("/quests", response_model=list[QuestOut])
async def quests(db: DB, user: CurrentUser, city: str = "yerevan") -> list[QuestOut]:
    selected = await game.require_city(db, city)
    return [
        await game.quest_output(db, quest, user)
        for quest in await game.available_quests(db, selected)
    ]


@router.get("/quests/{quest_id}", response_model=QuestOut)
async def quest(quest_id: UUID, db: DB, user: CurrentUser) -> QuestOut:
    item = await db.get(Quest, quest_id)
    if item is None:
        raise HTTPException(404, "Quest not found")
    selected = await game.require_city(db, "yerevan")
    if item.id not in {q.id for q in await game.available_quests(db, selected)}:
        raise HTTPException(404, "Quest is not available")
    return await game.quest_output(db, item, user)


@router.post("/quests/{quest_id}/start", response_model=RunOut, status_code=201)
async def start(quest_id: UUID, db: DB, user: CurrentUser) -> RunOut:
    return await game.start_quest(db, user, quest_id)


@router.post("/quest-runs/{run_id}/check-in", response_model=CompletionOut)
async def check_in(
    run_id: UUID, data: CheckInInput, db: DB, user: CurrentUser, settings: Config
) -> CompletionOut:
    return await game.check_in(db, user, run_id, data, settings)


@router.get("/leaderboard", response_model=LeaderboardOut)
async def leaderboard(db: DB, user: CurrentUser, city: str = "yerevan") -> LeaderboardOut:
    return await game.leaderboard(db, user, await game.require_city(db, city))


@router.get("/admin/users", response_model=list[UserOut])
async def admin_users(
    db: DB, admin: AdminUser, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200)
):
    return (
        await db.scalars(
            select(User).order_by(User.created_at, User.id).offset(offset).limit(limit)
        )
    ).all()


@router.get("/admin/teams", response_model=list[TeamOut])
async def admin_teams(
    db: DB, admin: AdminUser, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200)
):
    teams = (
        await db.scalars(
            select(Team).order_by(Team.created_at, Team.id).offset(offset).limit(limit)
        )
    ).all()
    return [await game.team_output(db, team) for team in teams]


@router.post("/admin/teams/{team_id}/block", response_model=TeamOut)
async def block_team(team_id: UUID, db: DB, admin: AdminUser):
    team = await game.lock_row(db, Team, team_id)
    team.status = TeamStatus.blocked
    await db.execute(
        update(TeamMember)
        .where(TeamMember.team_id == team_id, TeamMember.released_at.is_(None))
        .values(released_at=utcnow())
    )
    await db.flush()
    return await game.team_output(db, team)


@router.get("/admin/quests", response_model=list[QuestAdminOut])
async def admin_quests(
    db: DB, admin: AdminUser, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200)
):
    return (
        await db.scalars(
            select(Quest).order_by(Quest.created_at, Quest.id).offset(offset).limit(limit)
        )
    ).all()


async def quest_values(db: DB, data: QuestInput) -> dict:
    city = await game.require_city(db, data.city_slug)
    season = await db.get(Season, data.season_id)
    if season is None or season.city_id != city.id:
        raise HTTPException(422, "Season must belong to the selected city")
    return {**data.model_dump(exclude={"city_slug"}), "city_id": city.id}


@router.post("/admin/quests", response_model=QuestAdminOut, status_code=201)
async def admin_create_quest(data: QuestInput, db: DB, admin: AdminUser):
    item = Quest(**await quest_values(db, data))
    db.add(item)
    await db.flush()
    return item


@router.put("/admin/quests/{quest_id}", response_model=QuestAdminOut)
async def admin_edit_quest(quest_id: UUID, data: QuestInput, db: DB, admin: AdminUser):
    item = await game.lock_row(db, Quest, quest_id)
    values = await quest_values(db, data)
    if item.city_id != values["city_id"] or item.season_id != data.season_id:
        raise HTTPException(
            409, "Moving an existing quest between cities or seasons is not supported"
        )
    # Compare the coordinates that PostgreSQL Numeric(10, 7) will actually store.
    # A metadata/radius edit, or a change below storage precision, is not a replacement.
    latitude = Decimal(str(data.latitude)).quantize(Decimal("0.0000001"), rounding=ROUND_HALF_UP)
    longitude = Decimal(str(data.longitude)).quantize(Decimal("0.0000001"), rounding=ROUND_HALF_UP)
    rules = item.rules_json
    if (rules or {}).get("development_placeholder") and (item.latitude, item.longitude) != (
        latitude,
        longitude,
    ):
        rules = {
            key: value for key, value in rules.items() if key != "development_placeholder"
        } or None
    if (
        data.is_active
        and db.info.get("production")
        and (rules or {}).get("development_placeholder")
    ):
        raise HTTPException(409, "Replace the development checkpoint using PUT before activation")
    values.update(latitude=latitude, longitude=longitude)
    for key, value in values.items():
        setattr(item, key, value)
    item.rules_json = rules
    await db.flush()
    return item


@router.patch("/admin/quests/{quest_id}/active", response_model=QuestAdminOut)
async def admin_activate_quest(quest_id: UUID, data: ActiveInput, db: DB, admin: AdminUser):
    item = await game.lock_row(db, Quest, quest_id)
    if (
        data.is_active
        and db.info.get("production")
        and (item.rules_json or {}).get("development_placeholder")
    ):
        raise HTTPException(409, "Replace the development checkpoint using PUT before activation")
    item.is_active = data.is_active
    await db.flush()
    return item


@router.get("/admin/submissions", response_model=list[SubmissionOut])
async def admin_submissions(
    db: DB, admin: AdminUser, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200)
):
    return (
        await db.scalars(
            select(Submission)
            .order_by(Submission.created_at.desc(), Submission.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()


@router.post("/admin/score-events", response_model=ScoreOut, status_code=201)
async def admin_adjust_score(data: AdjustmentInput, db: DB, admin: AdminUser):
    team = await game.lock_row(db, Team, data.team_id)
    season = await db.get(Season, data.season_id)
    if season is None or season.city_id != team.city_id:
        raise HTTPException(422, "Team and season must belong to the same city")
    event = ScoreEvent(
        team_id=team.id,
        season_id=season.id,
        user_id=admin.id,
        amount=data.amount,
        reason="admin_adjustment",
        note=data.note,
    )
    db.add(event)
    await db.flush()
    return event
