"""add project status to projects

Revision ID: 1b2c3d4e5f6a
Revises: 22f3b7c9a8d1
Create Date: 2026-06-06 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '1b2c3d4e5f6a'
down_revision: Union[str, Sequence[str], None] = '22f3b7c9a8d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


project_status = postgresql.ENUM(
    'draft',
    'active',
    'completed',
    'archived',
    name='project_status',
    create_type=False,
)


def upgrade() -> None:
    """Upgrade schema."""
    project_status.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'projects',
        sa.Column(
            'project_status',
            project_status,
            server_default='active',
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('projects', 'project_status')
    project_status.drop(op.get_bind(), checkfirst=True)
