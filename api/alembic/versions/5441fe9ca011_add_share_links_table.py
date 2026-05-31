"""add share_links table

Revision ID: 5441fe9ca011
Revises: c58f38d0a5aa
Create Date: 2026-05-16 14:00:57.160862

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

from alembic import op

# Mirror the RLS expressions from 2b5326d2d299 so an unset app.current_org
# (the public /shared/{token} endpoint, API key, dev mode) sees all rows while
# tenant-scoped sessions remain isolated by org.
_UNSET = (
    "current_setting('app.current_org', true) IS NULL"
    " OR current_setting('app.current_org', true) = ''"
)
_VIA_NODE_INDIRECT = (
    "node_id IN ("
    "SELECT n.id FROM nodes n"
    " JOIN spaces s ON s.id = n.space_id"
    " JOIN workspaces w ON w.id = s.workspace_id"
    " WHERE w.org_id = current_setting('app.current_org', true)::uuid)"
)


# revision identifiers, used by Alembic.
revision: str = '5441fe9ca011'
down_revision: Union[str, Sequence[str], None] = 'c58f38d0a5aa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "share_links",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("node_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["node_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token", name="uq_share_links_token"),
    )
    op.create_index("ix_share_links_node_id", "share_links", ["node_id"])

    op.execute(text("ALTER TABLE share_links ENABLE ROW LEVEL SECURITY"))
    op.execute(text("ALTER TABLE share_links FORCE ROW LEVEL SECURITY"))
    op.execute(
        text(
            "CREATE POLICY tenant_isolation ON share_links"
            f" USING ({_UNSET} OR {_VIA_NODE_INDIRECT})"
        )
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(text("DROP POLICY IF EXISTS tenant_isolation ON share_links"))
    op.execute(text("ALTER TABLE share_links DISABLE ROW LEVEL SECURITY"))
    op.drop_index("ix_share_links_node_id", table_name="share_links")
    op.drop_table("share_links")
