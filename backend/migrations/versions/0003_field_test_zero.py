"""Fixed FIELD TEST 0 sequence, GPS proof and idempotent penalty ledger."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("quests", sa.Column("field_test_step", sa.Integer(), nullable=True))
    op.add_column("quests", sa.Column("answer_text", sa.String(200), nullable=True))
    op.add_column("quests", sa.Column("answer_hint", sa.String(1000), nullable=True))
    op.add_column(
        "quest_runs", sa.Column("gps_verified_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_unique_constraint("uq_field_test_step", "quests", ["season_id", "field_test_step"])
    op.create_check_constraint("field_test_step_range", "quests", "field_test_step BETWEEN 1 AND 4")
    op.create_check_constraint(
        "field_test_config",
        "quests",
        "field_test_step IS NULL OR "
        "(season_id IS NOT NULL AND base_xp = 250 AND answer_text IS NOT NULL)",
    )
    op.drop_constraint(op.f("ck_quests_location_checkpoint"), "quests", type_="check")
    op.create_check_constraint(
        "location_checkpoint",
        "quests",
        "quest_type != 'location' OR field_test_step IS NOT NULL OR "
        "(latitude IS NOT NULL AND longitude IS NOT NULL AND radius_m IS NOT NULL)",
    )
    op.drop_constraint(op.f("ck_score_events_score_reason"), "score_events", type_="check")
    op.create_check_constraint(
        "score_reason",
        "score_events",
        "reason IN ('quest_completion', 'admin_adjustment', 'hint_penalty', 'wrong_answer_penalty')",
    )
    op.create_check_constraint(
        "penalty_requires_run",
        "score_events",
        "reason NOT IN ('hint_penalty', 'wrong_answer_penalty') OR "
        "(quest_run_id IS NOT NULL AND "
        "((reason = 'hint_penalty' AND amount = -50) OR "
        "(reason = 'wrong_answer_penalty' AND amount = -25)))",
    )
    op.create_index(
        "uq_penalty_score_run_reason",
        "score_events",
        ["quest_run_id", "reason"],
        unique=True,
        postgresql_where=sa.text("reason IN ('hint_penalty', 'wrong_answer_penalty')"),
    )


def downgrade() -> None:
    # Never delete/rewrite append-only penalties to force an incompatible downgrade.
    # PostgreSQL rejects restoring the old reason constraint if penalties exist.
    op.drop_index("uq_penalty_score_run_reason", table_name="score_events")
    op.drop_constraint(op.f("ck_score_events_penalty_requires_run"), "score_events", type_="check")
    op.drop_constraint(op.f("ck_score_events_score_reason"), "score_events", type_="check")
    op.create_check_constraint(
        "score_reason", "score_events", "reason IN ('quest_completion', 'admin_adjustment')"
    )
    op.drop_constraint(op.f("ck_quests_location_checkpoint"), "quests", type_="check")
    op.create_check_constraint(
        "location_checkpoint",
        "quests",
        "quest_type != 'location' OR "
        "(latitude IS NOT NULL AND longitude IS NOT NULL AND radius_m IS NOT NULL)",
    )
    op.drop_constraint(op.f("ck_quests_field_test_config"), "quests", type_="check")
    op.drop_constraint(op.f("ck_quests_field_test_step_range"), "quests", type_="check")
    op.drop_constraint("uq_field_test_step", "quests", type_="unique")
    op.drop_column("quest_runs", "gps_verified_at")
    op.drop_column("quests", "answer_hint")
    op.drop_column("quests", "answer_text")
    op.drop_column("quests", "field_test_step")
