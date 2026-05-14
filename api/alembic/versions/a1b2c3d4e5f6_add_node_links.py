"""add node_links table for backlinks

Revision ID: a1b2c3d4e5f6
Revises: c58f38d0a5aa
Create Date: 2026-05-13 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "c58f38d0a5aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "node_links",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("source_node_id", UUID(as_uuid=True), nullable=False),
        sa.Column("target_node_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["source_node_id"], ["nodes.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["target_node_id"], ["nodes.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "source_node_id", "target_node_id", name="uq_node_links_pair"
        ),
        sa.CheckConstraint(
            "source_node_id <> target_node_id", name="node_links_no_self"
        ),
    )
    op.create_index(
        "idx_node_links_target", "node_links", ["target_node_id"]
    )
    op.create_index(
        "idx_node_links_source", "node_links", ["source_node_id"]
    )


def downgrade() -> None:
    op.drop_index("idx_node_links_source", table_name="node_links")
    op.drop_index("idx_node_links_target", table_name="node_links")
    op.drop_table("node_links")
