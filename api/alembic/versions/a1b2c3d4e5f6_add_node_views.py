"""add node_views table

Revision ID: a1b2c3d4e5f6
Revises: c58f38d0a5aa
Create Date: 2026-05-13 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "c58f38d0a5aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "node_views",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "folder_node_id",
            sa.UUID(),
            sa.ForeignKey("nodes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("view_type", sa.Text(), nullable=False),
        sa.Column(
            "config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("position", sa.Text(), nullable=False, server_default="a0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "view_type IN ('table', 'board', 'list')", name="node_views_type_valid"
        ),
    )
    op.create_index(
        "idx_node_views_folder", "node_views", ["folder_node_id", "position"]
    )

    # Enforce that folder_node_id references a node with type='folder'.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION node_views_check_folder()
        RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE
            t TEXT;
        BEGIN
            SELECT type INTO t FROM nodes WHERE id = NEW.folder_node_id;
            IF t IS NULL OR t <> 'folder' THEN
                RAISE EXCEPTION 'node_views.folder_node_id must reference a folder node';
            END IF;
            RETURN NEW;
        END;
        $$;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_node_views_check_folder
        BEFORE INSERT OR UPDATE OF folder_node_id ON node_views
        FOR EACH ROW EXECUTE FUNCTION node_views_check_folder();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_node_views_check_folder ON node_views")
    op.execute("DROP FUNCTION IF EXISTS node_views_check_folder()")
    op.drop_index("idx_node_views_folder", table_name="node_views")
    op.drop_table("node_views")
