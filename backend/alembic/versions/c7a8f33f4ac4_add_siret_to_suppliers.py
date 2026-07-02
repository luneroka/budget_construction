"""add siret to suppliers

Revision ID: c7a8f33f4ac4
Revises: d4f6a8b2c9e1
Create Date: 2026-07-02 14:27:57.137480

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c7a8f33f4ac4'
down_revision: Union[str, Sequence[str], None] = 'd4f6a8b2c9e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'suppliers',
        sa.Column('siret', sa.String(length=14), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('suppliers', 'siret')
