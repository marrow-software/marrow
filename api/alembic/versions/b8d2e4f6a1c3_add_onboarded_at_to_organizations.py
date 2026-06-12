"""add onboarded_at to organizations

Revision ID: b8d2e4f6a1c3
Revises: a1b2c3d4e5f6
Create Date: 2026-06-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b8d2e4f6a1c3'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'organizations',
        sa.Column('onboarded_at', sa.DateTime(timezone=True), nullable=True),
    )
    # Backfill: existing orgs are treated as already onboarded so current
    # users are never sent through the first-run /onboarding step.
    op.execute("UPDATE organizations SET onboarded_at = created_at")


def downgrade() -> None:
    op.drop_column('organizations', 'onboarded_at')
