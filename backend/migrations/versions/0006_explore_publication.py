"""Explicit publication and immutable Explore content; existing runs retain their guide."""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "explore_guides", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True)
    )
    # Before this migration every guide was implicitly published. Preserve those
    # versions and their original UUIDs/stops/credentials without rewriting content.
    op.execute("UPDATE explore_guides SET published_at = created_at")
    op.execute("""
        CREATE FUNCTION protect_explore_guide() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF OLD.published_at IS NOT NULL THEN
                IF TG_OP = 'DELETE' THEN
                    RAISE EXCEPTION 'Published Explore versions cannot be deleted' USING ERRCODE = '23514';
                END IF;
                IF NEW IS DISTINCT FROM OLD THEN
                    RAISE EXCEPTION 'Published Explore versions are immutable' USING ERRCODE = '23514';
                END IF;
            END IF;
            IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
            RETURN NEW;
        END $$
    """)
    op.execute("""
        CREATE TRIGGER protect_explore_guide BEFORE UPDATE OR DELETE ON explore_guides
        FOR EACH ROW EXECUTE FUNCTION protect_explore_guide()
    """)
    op.execute("""
        CREATE FUNCTION protect_explore_stop() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE
            old_guide uuid;
            new_guide uuid;
            parent record;
        BEGIN
            IF TG_OP <> 'INSERT' THEN old_guide := OLD.guide_id; END IF;
            IF TG_OP <> 'DELETE' THEN new_guide := NEW.guide_id; END IF;
            -- Lock parents in a stable order; publication and stop writes cannot race.
            FOR parent IN SELECT published_at FROM explore_guides
                WHERE id = old_guide OR id = new_guide ORDER BY id FOR UPDATE
            LOOP
                IF parent.published_at IS NOT NULL THEN
                    RAISE EXCEPTION 'Published Explore stops are immutable' USING ERRCODE = '23514';
                END IF;
            END LOOP;
            IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
            RETURN NEW;
        END $$
    """)
    op.execute("""
        CREATE TRIGGER protect_explore_stop BEFORE INSERT OR UPDATE OR DELETE ON explore_stops
        FOR EACH ROW EXECUTE FUNCTION protect_explore_stop()
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER protect_explore_stop ON explore_stops")
    op.execute("DROP FUNCTION protect_explore_stop()")
    op.execute("DROP TRIGGER protect_explore_guide ON explore_guides")
    op.execute("DROP FUNCTION protect_explore_guide()")
    op.drop_column("explore_guides", "published_at")
