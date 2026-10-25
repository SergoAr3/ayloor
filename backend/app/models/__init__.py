"""Explicit SQLAlchemy models for the v0.1 modular monolith."""

import enum
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    MetaData,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(table_name)s_%(column_0_name)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class TeamStatus(str, enum.Enum):
    pending = "pending"
    active = "active"
    blocked = "blocked"


class MemberRole(str, enum.Enum):
    captain = "captain"
    member = "member"


class SeasonStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    finished = "finished"


class QuestType(str, enum.Enum):
    location = "location"
    photo = "photo"
    answer = "answer"
    team = "team"
    mixed = "mixed"


class VerificationLevel(str, enum.Enum):
    system = "system"
    moderated = "moderated"
    team_confirmed = "team_confirmed"
    honor = "honor"


class RunStatus(str, enum.Enum):
    started = "started"
    completed = "completed"
    failed = "failed"


class SubmissionType(str, enum.Enum):
    location = "location"
    photo = "photo"
    answer = "answer"
    team_confirmation = "team_confirmation"


class SubmissionStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"


class Identity:
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)


class Created:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Updated:
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class User(Identity, Created, Updated, Base):
    __tablename__ = "users"
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    username: Mapped[str | None] = mapped_column(String(255))
    first_name: Mapped[str | None] = mapped_column(String(255))
    last_name: Mapped[str | None] = mapped_column(String(255))
    language_code: Mapped[str | None] = mapped_column(String(32))


class City(Identity, Created, Base):
    __tablename__ = "cities"
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    country_code: Mapped[str] = mapped_column(String(2))
    timezone: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Team(Identity, Created, Updated, Base):
    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("id", "city_id", name="uq_team_id_city"),)
    city_id: Mapped[UUID] = mapped_column(ForeignKey("cities.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    captain_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    status: Mapped[TeamStatus] = mapped_column(Enum(TeamStatus), default=TeamStatus.pending)


class TeamMember(Identity, Base):
    __tablename__ = "team_members"
    __table_args__ = (
        ForeignKeyConstraint(["team_id", "city_id"], ["teams.id", "teams.city_id"]),
        UniqueConstraint("team_id", "user_id", name="uq_team_member"),
        Index(
            "uq_current_membership_city",
            "user_id",
            "city_id",
            unique=True,
            postgresql_where=text("released_at IS NULL"),
        ),
    )
    team_id: Mapped[UUID] = mapped_column(index=True)
    city_id: Mapped[UUID]
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[MemberRole] = mapped_column(Enum(MemberRole), default=MemberRole.member)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Season(Identity, Created, Base):
    __tablename__ = "seasons"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="season_interval"),
        Index(
            "uq_active_season_city",
            "city_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )
    city_id: Mapped[UUID] = mapped_column(ForeignKey("cities.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[SeasonStatus] = mapped_column(Enum(SeasonStatus), default=SeasonStatus.draft)


class Quest(Identity, Created, Updated, Base):
    __tablename__ = "quests"
    __table_args__ = (
        CheckConstraint("base_xp > 0", name="positive_xp"),
        CheckConstraint("radius_m IS NULL OR radius_m > 0", name="positive_radius"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="latitude_range"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="longitude_range"),
        CheckConstraint(
            "expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at",
            name="quest_interval",
        ),
        CheckConstraint(
            "quest_type != 'location' OR (latitude IS NOT NULL AND longitude IS NOT NULL AND radius_m IS NOT NULL)",
            name="location_checkpoint",
        ),
    )
    city_id: Mapped[UUID] = mapped_column(ForeignKey("cities.id"), index=True)
    season_id: Mapped[UUID | None] = mapped_column(ForeignKey("seasons.id"), index=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    look_for_hint: Mapped[str | None] = mapped_column(String(1000))
    hero_image_url: Mapped[str | None] = mapped_column(String(2048))
    place_label: Mapped[str | None] = mapped_column(String(255))
    quest_type: Mapped[QuestType] = mapped_column(Enum(QuestType), default=QuestType.location)
    verification_level: Mapped[VerificationLevel] = mapped_column(
        Enum(VerificationLevel), default=VerificationLevel.system
    )
    base_xp: Mapped[int] = mapped_column(Integer)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7))
    radius_m: Mapped[int | None] = mapped_column(Integer)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    rules_json: Mapped[dict | None] = mapped_column(JSONB)


class QuestRun(Identity, Base):
    __tablename__ = "quest_runs"
    __table_args__ = (
        UniqueConstraint("team_id", "quest_id", name="uq_team_quest_once"),
        UniqueConstraint("id", "team_id", name="uq_run_id_team"),
        CheckConstraint(
            "(status = 'completed') = (completed_at IS NOT NULL)", name="completion_timestamp"
        ),
    )
    quest_id: Mapped[UUID] = mapped_column(ForeignKey("quests.id"), index=True)
    team_id: Mapped[UUID] = mapped_column(ForeignKey("teams.id"), index=True)
    status: Mapped[RunStatus] = mapped_column(Enum(RunStatus), default=RunStatus.started)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Submission(Identity, Created, Base):
    __tablename__ = "submissions"
    __table_args__ = (
        Index(
            "uq_accepted_submission_run",
            "quest_run_id",
            unique=True,
            postgresql_where=text("status = 'accepted'"),
        ),
        CheckConstraint(
            "horizontal_accuracy IS NULL OR horizontal_accuracy >= 0", name="accuracy_nonnegative"
        ),
    )
    quest_run_id: Mapped[UUID] = mapped_column(ForeignKey("quest_runs.id"), index=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    submission_type: Mapped[SubmissionType] = mapped_column(Enum(SubmissionType))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7))
    horizontal_accuracy: Mapped[float | None] = mapped_column(Float)
    answer: Mapped[str | None] = mapped_column(Text)
    telegram_file_id: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[SubmissionStatus] = mapped_column(Enum(SubmissionStatus))


class ScoreEvent(Identity, Created, Base):
    __tablename__ = "score_events"
    __table_args__ = (
        ForeignKeyConstraint(["quest_run_id", "team_id"], ["quest_runs.id", "quest_runs.team_id"]),
        Index(
            "uq_completion_score_run",
            "quest_run_id",
            unique=True,
            postgresql_where=text("reason = 'quest_completion'"),
        ),
        CheckConstraint("reason IN ('quest_completion', 'admin_adjustment')", name="score_reason"),
        CheckConstraint(
            "reason != 'quest_completion' OR (quest_run_id IS NOT NULL AND amount > 0)",
            name="completion_requires_run",
        ),
        CheckConstraint(
            "reason != 'admin_adjustment' OR quest_run_id IS NULL", name="adjustment_no_run"
        ),
        CheckConstraint("amount != 0", name="nonzero_score"),
        Index("ix_score_season_team", "season_id", "team_id"),
    )
    season_id: Mapped[UUID] = mapped_column(ForeignKey("seasons.id"))
    team_id: Mapped[UUID] = mapped_column(ForeignKey("teams.id"))
    user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"))
    quest_run_id: Mapped[UUID | None]
    amount: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(80))
    note: Mapped[str | None] = mapped_column(String(500))


class Invite(Identity, Created, Base):
    __tablename__ = "invites"
    __table_args__ = (
        CheckConstraint("uses >= 0", name="uses_nonnegative"),
        CheckConstraint(
            "max_uses IS NULL OR (max_uses > 0 AND uses <= max_uses)", name="invite_uses_limit"
        ),
    )
    team_id: Mapped[UUID] = mapped_column(ForeignKey("teams.id"), index=True)
    created_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    code: Mapped[str] = mapped_column(String(40), unique=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    max_uses: Mapped[int | None] = mapped_column(Integer)
    uses: Mapped[int] = mapped_column(Integer, default=0)
