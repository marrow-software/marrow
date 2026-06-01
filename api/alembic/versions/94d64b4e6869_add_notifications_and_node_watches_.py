"""add node_watches table

Revision ID: 94d64b4e6869
Revises: 63d0b2f71a42
Create Date: 2026-05-16 21:37:04.638061

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '94d64b4e6869'
down_revision: Union[str, Sequence[str], None] = '63d0b2f71a42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'node_watches',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('node_id', sa.UUID(), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.ForeignKeyConstraint(['node_id'], ['nodes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'node_id', name='uq_node_watches_user_node'),
    )
    op.create_index('idx_node_watches_node', 'node_watches', ['node_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_node_watches_node', table_name='node_watches')
    op.drop_table('node_watches')
