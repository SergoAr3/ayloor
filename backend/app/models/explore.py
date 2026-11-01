"""Additive, anonymous Explore guide state; no multiplayer identity or scoring."""

from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base, Created, Identity


class Guide(Identity, Created, Base):
    __tablename__ = "explore_guides"
    # Published guides are immutable versions. New content gets a new slug/row.
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)


class GuideStop(Identity, Base):
    __tablename__ = "explore_stops"
    __table_args__ = (
        UniqueConstraint("guide_id", "position", name="uq_explore_stop_position"),
        CheckConstraint("position > 0", name="positive_position"),
    )
    guide_id: Mapped[UUID] = mapped_column(ForeignKey("explore_guides.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(255))
    clue: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(String(200))
    hint: Mapped[str] = mapped_column(Text)
    reveal: Mapped[str] = mapped_column(Text)


class ExploreRun(Identity, Created, Base):
    __tablename__ = "explore_runs"
    __table_args__ = (
        CheckConstraint("position > 0", name="positive_position"),
        CheckConstraint("phase IN ('clue', 'reveal', 'finished')", name="phase"),
    )
    guide_id: Mapped[UUID] = mapped_column(ForeignKey("explore_guides.id"), index=True)
    credential_hash: Mapped[str] = mapped_column(String(64), unique=True)
    start_hash: Mapped[str] = mapped_column(String(64), unique=True)
    position: Mapped[int] = mapped_column(Integer, default=1)
    phase: Mapped[str] = mapped_column(String(16), default="clue")
    # A tiny per-run list, replaced on write under the run lock (not mutated in place).
    hinted_positions: Mapped[list[int]] = mapped_column(JSONB, default=list)
