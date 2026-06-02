"""remove parent_template_item_id from project_template_items

Revision ID: 70d84b688c5f
Revises: 5f869ec3ffbf
Create Date: 2026-06-02 15:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '70d84b688c5f'
down_revision: Union[str, Sequence[str], None] = '5f869ec3ffbf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_index(
        op.f('ix_project_template_items_parent_template_item_id'),
        table_name='project_template_items',
    )
    op.drop_constraint(
        op.f('project_template_items_parent_template_item_id_fkey'),
        table_name='project_template_items',
        type_='foreignkey',
    )
    op.drop_column('project_template_items', 'parent_template_item_id')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        'project_template_items',
        sa.Column('parent_template_item_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        op.f('project_template_items_parent_template_item_id_fkey'),
        'project_template_items',
        'project_template_items',
        ['parent_template_item_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_index(
        op.f('ix_project_template_items_parent_template_item_id'),
        'project_template_items',
        ['parent_template_item_id'],
        unique=False,
    )
