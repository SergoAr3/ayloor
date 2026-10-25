"""Optional authored quest content; existing quests keep null content."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("quests", sa.Column("look_for_hint", sa.String(1000), nullable=True))
    op.add_column("quests", sa.Column("hero_image_url", sa.String(2048), nullable=True))
    op.add_column("quests", sa.Column("place_label", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("quests", "place_label")
    op.drop_column("quests", "hero_image_url")
    op.drop_column("quests", "look_for_hint")
