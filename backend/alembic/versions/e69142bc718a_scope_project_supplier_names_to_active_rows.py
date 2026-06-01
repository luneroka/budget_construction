"""scope project and supplier names to active rows

Revision ID: e69142bc718a
Revises: d8f21b630a44
Create Date: 2026-06-01 15:05:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e69142bc718a'
down_revision: Union[str, Sequence[str], None] = 'd8f21b630a44'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint('uq_projects_user_id_name', 'projects', type_='unique')
    op.create_index(
        'uq_projects_user_id_name',
        'projects',
        ['user_id', 'name'],
        unique=True,
        postgresql_where=sa.text('deleted_at IS NULL'),
    )

    op.drop_constraint('uq_suppliers_user_id_name', 'suppliers', type_='unique')
    op.create_index(
        'uq_suppliers_user_id_name',
        'suppliers',
        ['user_id', 'name'],
        unique=True,
        postgresql_where=sa.text('deleted_at IS NULL'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('uq_suppliers_user_id_name', table_name='suppliers')
    op.create_unique_constraint(
        'uq_suppliers_user_id_name',
        'suppliers',
        ['user_id', 'name'],
    )

    op.drop_index('uq_projects_user_id_name', table_name='projects')
    op.create_unique_constraint(
        'uq_projects_user_id_name',
        'projects',
        ['user_id', 'name'],
    )
