"""add billing columns to organizations

Revision ID: c58f38d0a5aa
Revises: fdf65c08ffa8
Create Date: 2026-05-07 00:03:19.696693

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c58f38d0a5aa'
down_revision: Union[str, Sequence[str], None] = 'fdf65c08ffa8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('organizations', sa.Column('tier', sa.Text(), server_default='starter', nullable=False))
    op.add_column('organizations', sa.Column('billing_interval', sa.Text(), nullable=True))
    op.add_column('organizations', sa.Column('stripe_customer_id', sa.Text(), nullable=True))
    op.add_column('organizations', sa.Column('stripe_subscription_id', sa.Text(), nullable=True))
    op.add_column('organizations', sa.Column('self_hosted_license', sa.Text(), nullable=True))
    op.create_unique_constraint('uq_organizations_stripe_customer_id', 'organizations', ['stripe_customer_id'])
    op.create_unique_constraint('uq_organizations_stripe_subscription_id', 'organizations', ['stripe_subscription_id'])


def downgrade() -> None:
    op.drop_constraint('uq_organizations_stripe_subscription_id', 'organizations', type_='unique')
    op.drop_constraint('uq_organizations_stripe_customer_id', 'organizations', type_='unique')
    op.drop_column('organizations', 'self_hosted_license')
    op.drop_column('organizations', 'stripe_subscription_id')
    op.drop_column('organizations', 'stripe_customer_id')
    op.drop_column('organizations', 'billing_interval')
    op.drop_column('organizations', 'tier')
