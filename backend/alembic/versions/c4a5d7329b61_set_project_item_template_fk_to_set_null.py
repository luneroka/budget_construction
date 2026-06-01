"""set project item template foreign key to set null

Revision ID: c4a5d7329b61
Revises: af18ade45655
Create Date: 2026-06-01 14:10:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c4a5d7329b61'
down_revision: Union[str, Sequence[str], None] = 'af18ade45655'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint(
        op.f('project_items_template_item_id_fkey'),
        table_name='project_items',
        type_='foreignkey',
    )
    op.create_foreign_key(
        op.f('project_items_template_item_id_fkey'),
        'project_items',
        'project_template_items',
        ['template_item_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        op.f('project_items_template_item_id_fkey'),
        table_name='project_items',
        type_='foreignkey',
    )
    op.create_foreign_key(
        op.f('project_items_template_item_id_fkey'),
        'project_items',
        'project_template_items',
        ['template_item_id'],
        ['id'],
        ondelete='CASCADE',
    )
