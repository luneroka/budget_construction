"""add unique template item product per template

Revision ID: d4f6a8b2c9e1
Revises: c31a2f4d8e90
Create Date: 2026-06-12 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd4f6a8b2c9e1'
down_revision: Union[str, Sequence[str], None] = 'c31a2f4d8e90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_unique_constraint(
        'uq_template_items_template_id_product_id',
        'template_items',
        ['template_id', 'product_id'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        'uq_template_items_template_id_product_id',
        'template_items',
        type_='unique',
    )
