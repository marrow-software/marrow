"""add org type and member space creation flag

Revision ID: a8c2f1e9b3d4
Revises: c58f38d0a5aa
Create Date: 2026-05-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a8c2f1e9b3d4"
down_revision: Union[str, Sequence[str], None] = "c58f38d0a5aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "type",
            sa.Text(),
            server_default="individual",
            nullable=False,
        ),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "allow_member_space_creation",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "organizations_type_valid",
        "organizations",
        "type IN ('individual', 'organization')",
    )


def downgrade() -> None:
    op.drop_constraint("organizations_type_valid", "organizations", type_="check")
    op.drop_column("organizations", "allow_member_space_creation")
    op.drop_column("organizations", "type")
