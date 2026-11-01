"""Optional Explore checkpoints and current-stop Arrival; no legacy changes."""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("explore_stops", sa.Column("directions", sa.Text(), nullable=True))
    for name in ("latitude", "longitude", "radius_m", "max_accuracy_m"):
        op.add_column("explore_stops", sa.Column(name, sa.Float(), nullable=True))
    op.create_check_constraint(
        "checkpoint",
        "explore_stops",
        """
(latitude IS NULL AND longitude IS NULL AND radius_m IS NULL AND max_accuracy_m IS NULL)
OR (latitude IS NOT NULL AND longitude IS NOT NULL
    AND radius_m IS NOT NULL AND max_accuracy_m IS NOT NULL
    AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
    AND radius_m > 0 AND radius_m < 'Infinity'::float8
    AND max_accuracy_m > 0 AND max_accuracy_m < 'Infinity'::float8
    AND directions IS NOT NULL AND length(trim(directions)) > 0)
""",
    )
    op.add_column("explore_runs", sa.Column("arrived_stop_id", sa.Uuid(), nullable=True))
    op.add_column(
        "explore_runs", sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_explore_runs_arrived_stop_id_explore_stops",
        "explore_runs",
        "explore_stops",
        ["arrived_stop_id"],
        ["id"],
    )
    op.create_check_constraint(
        "arrival_pair", "explore_runs", "(arrived_stop_id IS NULL) = (arrived_at IS NULL)"
    )


def downgrade() -> None:
    op.drop_constraint("arrival_pair", "explore_runs", type_="check")
    op.drop_constraint(
        "fk_explore_runs_arrived_stop_id_explore_stops", "explore_runs", type_="foreignkey"
    )
    op.drop_column("explore_runs", "arrived_at")
    op.drop_column("explore_runs", "arrived_stop_id")
    op.drop_constraint("checkpoint", "explore_stops", type_="check")
    for name in ("max_accuracy_m", "radius_m", "longitude", "latitude", "directions"):
        op.drop_column("explore_stops", name)
