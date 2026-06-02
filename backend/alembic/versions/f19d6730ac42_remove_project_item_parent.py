"""remove project item parent

Revision ID: f19d6730ac42
Revises: b2c3a84f91d7
Create Date: 2026-06-02 17:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f19d6730ac42'
down_revision: Union[str, Sequence[str], None] = 'b2c3a84f91d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint(
        'ck_project_items_product_has_no_parent',
        'project_items',
        type_='check',
    )
    op.drop_index(
        op.f('ix_project_items_parent_item_id'),
        table_name='project_items',
    )
    op.drop_constraint(
        op.f('project_items_parent_item_id_fkey'),
        'project_items',
        type_='foreignkey',
    )
    op.drop_column('project_items', 'parent_item_id')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        'project_items',
        sa.Column('parent_item_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        op.f('project_items_parent_item_id_fkey'),
        'project_items',
        'project_items',
        ['parent_item_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_index(
        op.f('ix_project_items_parent_item_id'),
        'project_items',
        ['parent_item_id'],
        unique=False,
    )
    op.create_check_constraint(
        'ck_project_items_product_has_no_parent',
        'project_items',
        "item_type = 'breakdown' OR parent_item_id IS NULL",
    )
