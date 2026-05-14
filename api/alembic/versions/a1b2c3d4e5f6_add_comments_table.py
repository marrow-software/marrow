"""add comments table

Revision ID: a1b2c3d4e5f6
Revises: c58f38d0a5aa
Create Date: 2026-05-13 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "c58f38d0a5aa"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_VIA_WORKSPACE = "org_id = current_setting('app.current_org', true)::uuid"
_UNSET = (
    "current_setting('app.current_org', true) IS NULL"
    " OR current_setting('app.current_org', true) = ''"
)
_VIA_COMMENT = (
    "node_id IN ("
    "SELECT n.id FROM nodes n"
    " JOIN spaces s ON s.id = n.space_id"
    " JOIN workspaces w ON w.id = s.workspace_id"
    f" WHERE {_VIA_WORKSPACE})"
)


def upgrade() -> None:
    op.create_table(
        "comments",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "node_id", sa.UUID(), sa.ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "author_user_id",
            sa.UUID(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "parent_comment_id",
            sa.UUID(),
            sa.ForeignKey("comments.id", ondelete="CASCADE"),
            nullable=True,
        ),
        # Reserved for future block-level comments (#92 follow-up).
        sa.Column("block_id", sa.Text(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_comments_node_id", "comments", ["node_id"])
    op.create_index("ix_comments_parent_comment_id", "comments", ["parent_comment_id"])

    # Enforce that comments only attach to page-typed nodes.
    op.execute(
        "ALTER TABLE comments ADD CONSTRAINT comments_node_is_page CHECK (node_is_page(node_id))"
    )

    # RLS — match the policy applied to revisions/attachments in 2b5326d2d299.
    op.execute("ALTER TABLE comments ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE comments FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON comments USING ({_UNSET} OR {_VIA_COMMENT})"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON comments")
    op.execute("ALTER TABLE comments DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_comments_parent_comment_id", table_name="comments")
    op.drop_index("ix_comments_node_id", table_name="comments")
    op.drop_table("comments")
