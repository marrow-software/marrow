"""add notifications and node_watches tables

Revision ID: 94d64b4e6869
Revises: c58f38d0a5aa
Create Date: 2026-05-16 21:37:04.638061

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '94d64b4e6869'
down_revision: Union[str, Sequence[str], None] = 'c58f38d0a5aa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'notifications',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('kind', sa.Text(), nullable=False),
        sa.Column(
            'payload',
            postgresql.JSONB(astext_type=sa.Text()),
            server_default='{}',
            nullable=False,
        ),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.CheckConstraint(
            "kind IN ('mention', 'comment_reply', 'share_request', 'watch_event')",
            name='notifications_kind_valid',
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'idx_notifications_user_unread',
        'notifications',
        ['user_id', 'created_at'],
        postgresql_where=sa.text('read_at IS NULL'),
    )
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
    op.drop_index('idx_notifications_user_unread', table_name='notifications')
    op.drop_table('notifications')
