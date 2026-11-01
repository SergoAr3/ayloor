"""Additive, anonymous Explore guide state; no multiplayer identity or scoring."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base, Created, Identity


class Guide(Identity, Created, Base):
    __tablename__ = "explore_guides"
    # Published guides are immutable versions. New content gets a new slug/row.
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)


# Explicit NULL checks prevent SQL CHECK's unknown result accepting partial config.
CHECKPOINT_CONSTRAINT = """
(latitude IS NULL AND longitude IS NULL AND radius_m IS NULL AND max_accuracy_m IS NULL)
OR (latitude IS NOT NULL AND longitude IS NOT NULL
    AND radius_m IS NOT NULL AND max_accuracy_m IS NOT NULL
    AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
    AND radius_m > 0 AND radius_m < 'Infinity'::float8
    AND max_accuracy_m > 0 AND max_accuracy_m < 'Infinity'::float8
    AND directions IS NOT NULL AND length(trim(directions)) > 0)
"""


class GuideStop(Identity, Base):
    __tablename__ = "explore_stops"
    __table_args__ = (
        UniqueConstraint("guide_id", "position", name="uq_explore_stop_position"),
        CheckConstraint(CHECKPOINT_CONSTRAINT, name="checkpoint"),
        CheckConstraint("position > 0", name="positive_position"),
    )
    guide_id: Mapped[UUID] = mapped_column(ForeignKey("explore_guides.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(255))
    clue: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(String(200))
    hint: Mapped[str] = mapped_column(Text)
    reveal: Mapped[str] = mapped_column(Text)
    directions: Mapped[str | None] = mapped_column(Text)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    radius_m: Mapped[float | None] = mapped_column(Float)
    max_accuracy_m: Mapped[float | None] = mapped_column(Float)


class ExploreRun(Identity, Created, Base):
    __tablename__ = "explore_runs"
    __table_args__ = (
        CheckConstraint("position > 0", name="positive_position"),
        CheckConstraint("phase IN ('clue', 'reveal', 'finished')", name="phase"),
        CheckConstraint("(arrived_stop_id IS NULL) = (arrived_at IS NULL)", name="arrival_pair"),
    )
    guide_id: Mapped[UUID] = mapped_column(ForeignKey("explore_guides.id"), index=True)
    credential_hash: Mapped[str] = mapped_column(String(64), unique=True)
    start_hash: Mapped[str] = mapped_column(String(64), unique=True)
    position: Mapped[int] = mapped_column(Integer, default=1)
    phase: Mapped[str] = mapped_column(String(16), default="clue")
    # A tiny per-run list, replaced on write under the run lock (not mutated in place).
    hinted_positions: Mapped[list[int]] = mapped_column(JSONB, default=list)
    arrived_stop_id: Mapped[UUID | None] = mapped_column(ForeignKey("explore_stops.id"))
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
