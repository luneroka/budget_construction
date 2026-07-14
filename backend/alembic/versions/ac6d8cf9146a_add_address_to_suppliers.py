"""add address to suppliers

Revision ID: ac6d8cf9146a
Revises: a1b2c3d4e5f6
Create Date: 2026-07-14 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'ac6d8cf9146a'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'suppliers',
        sa.Column('street', sa.String(length=255), nullable=True),
    )
    op.add_column(
        'suppliers',
        sa.Column('complement', sa.String(length=255), nullable=True),
    )
    op.add_column(
        'suppliers',
        sa.Column('postal_code', sa.String(length=5), nullable=True),
    )
    op.add_column(
        'suppliers',
        sa.Column('city', sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('suppliers', 'city')
    op.drop_column('suppliers', 'postal_code')
    op.drop_column('suppliers', 'complement')
    op.drop_column('suppliers', 'street')
