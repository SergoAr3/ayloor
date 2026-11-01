"""Add isolated Explore guides, stops and anonymous runs."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "explore_guides",
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "explore_stops",
        sa.Column("guide_id", sa.Uuid(), sa.ForeignKey("explore_guides.id"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("clue", sa.Text(), nullable=False),
        sa.Column("answer", sa.String(200), nullable=False),
        sa.Column("hint", sa.Text(), nullable=False),
        sa.Column("reveal", sa.Text(), nullable=False),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.UniqueConstraint("guide_id", "position", name="uq_explore_stop_position"),
        sa.CheckConstraint("position > 0", name="positive_position"),
    )
    op.create_index("ix_explore_stops_guide_id", "explore_stops", ["guide_id"])
    op.create_table(
        "explore_runs",
        sa.Column("guide_id", sa.Uuid(), sa.ForeignKey("explore_guides.id"), nullable=False),
        sa.Column("credential_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("start_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("phase", sa.String(16), nullable=False),
        sa.Column("hinted_positions", postgresql.JSONB(), nullable=False),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("position > 0", name="positive_position"),
        sa.CheckConstraint("phase IN ('clue', 'reveal', 'finished')", name="phase"),
    )
    op.create_index("ix_explore_runs_guide_id", "explore_runs", ["guide_id"])


def downgrade() -> None:
    op.drop_table("explore_runs")
    op.drop_table("explore_stops")
    op.drop_table("explore_guides")
