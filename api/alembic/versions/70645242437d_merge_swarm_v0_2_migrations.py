"""merge swarm v0.2 migrations

Revision ID: 70645242437d
Revises: 2187bd1a529d, 305b120ceb16, 3ee68ab5ba33, 5441fe9ca011, 94d64b4e6869, ac1e5d8ab0f8, cd990242773c, e3f7a92b1d05
Create Date: 2026-05-31 22:40:17.056087

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '70645242437d'
down_revision: Union[str, Sequence[str], None] = ('2187bd1a529d', '305b120ceb16', '3ee68ab5ba33', '5441fe9ca011', '94d64b4e6869', 'ac1e5d8ab0f8', 'cd990242773c', 'e3f7a92b1d05')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
