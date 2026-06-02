"""rename project templates to templates

Revision ID: a86d52f673c9
Revises: f19d6730ac42
Create Date: 2026-06-02 18:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a86d52f673c9'
down_revision: Union[str, Sequence[str], None] = 'f19d6730ac42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.rename_table('project_templates', 'templates')
    op.rename_table('project_template_items', 'template_items')
    op.alter_column(
        'template_items',
        'project_template_id',
        new_column_name='template_id',
    )

    op.execute('ALTER SEQUENCE project_templates_id_seq RENAME TO templates_id_seq')
    op.execute(
        'ALTER SEQUENCE project_template_items_id_seq RENAME TO template_items_id_seq'
    )

    op.execute('ALTER INDEX ix_project_templates_id RENAME TO ix_templates_id')
    op.execute(
        'ALTER INDEX ix_project_template_items_id RENAME TO ix_template_items_id'
    )
    op.execute(
        'ALTER INDEX ix_project_template_items_project_template_id '
        'RENAME TO ix_template_items_template_id'
    )
    op.execute(
        'ALTER INDEX ix_project_template_items_product_id '
        'RENAME TO ix_template_items_product_id'
    )

    op.execute(
        'ALTER TABLE templates '
        'RENAME CONSTRAINT project_templates_pkey TO templates_pkey'
    )
    op.execute(
        'ALTER TABLE templates '
        'RENAME CONSTRAINT uq_project_template_name TO uq_template_name'
    )
    op.execute(
        'ALTER TABLE template_items '
        'RENAME CONSTRAINT project_template_items_pkey TO template_items_pkey'
    )
    op.execute(
        'ALTER TABLE template_items '
        'RENAME CONSTRAINT project_template_items_project_template_id_fkey '
        'TO template_items_template_id_fkey'
    )
    op.execute(
        'ALTER TABLE template_items '
        'RENAME CONSTRAINT project_template_items_product_id_fkey '
        'TO template_items_product_id_fkey'
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(
        'ALTER TABLE template_items '
        'RENAME CONSTRAINT template_items_product_id_fkey '
        'TO project_template_items_product_id_fkey'
    )
    op.execute(
        'ALTER TABLE template_items '
        'RENAME CONSTRAINT template_items_template_id_fkey '
        'TO project_template_items_project_template_id_fkey'
    )
    op.execute(
        'ALTER TABLE template_items '
        'RENAME CONSTRAINT template_items_pkey TO project_template_items_pkey'
    )
    op.execute(
        'ALTER TABLE templates '
        'RENAME CONSTRAINT uq_template_name TO uq_project_template_name'
    )
    op.execute(
        'ALTER TABLE templates '
        'RENAME CONSTRAINT templates_pkey TO project_templates_pkey'
    )

    op.execute(
        'ALTER INDEX ix_template_items_product_id '
        'RENAME TO ix_project_template_items_product_id'
    )
    op.execute(
        'ALTER INDEX ix_template_items_template_id '
        'RENAME TO ix_project_template_items_project_template_id'
    )
    op.execute(
        'ALTER INDEX ix_template_items_id RENAME TO ix_project_template_items_id'
    )
    op.execute('ALTER INDEX ix_templates_id RENAME TO ix_project_templates_id')

    op.execute(
        'ALTER SEQUENCE template_items_id_seq '
        'RENAME TO project_template_items_id_seq'
    )
    op.execute('ALTER SEQUENCE templates_id_seq RENAME TO project_templates_id_seq')

    op.alter_column(
        'template_items',
        'template_id',
        new_column_name='project_template_id',
    )
    op.rename_table('template_items', 'project_template_items')
    op.rename_table('templates', 'project_templates')
