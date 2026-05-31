"""add members_can_create_spaces to organizations

Revision ID: e3f7a92b1d05
Revises: c58f38d0a5aa
Create Date: 2026-05-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e3f7a92b1d05'
down_revision: Union[str, Sequence[str], None] = 'c58f38d0a5aa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'organizations',
        sa.Column(
            'members_can_create_spaces',
            sa.Boolean(),
            server_default='true',
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column('organizations', 'members_can_create_spaces')
