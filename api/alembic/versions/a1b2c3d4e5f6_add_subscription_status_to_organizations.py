"""add subscription_status to organizations

Revision ID: a1b2c3d4e5f6
Revises: 70645242437d
Create Date: 2026-06-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '70645242437d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'organizations',
        sa.Column('subscription_status', sa.Text(), server_default='none', nullable=False),
    )
    # Backfill existing rows: enterprise tier and orgs with an active Stripe
    # subscription are already paying -> 'active'; everyone else stays 'none'.
    op.execute(
        """
        UPDATE organizations
        SET subscription_status = 'active'
        WHERE tier = 'enterprise'
           OR stripe_subscription_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column('organizations', 'subscription_status')
