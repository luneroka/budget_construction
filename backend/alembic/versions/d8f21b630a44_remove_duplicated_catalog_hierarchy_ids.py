"""remove duplicated catalog hierarchy ids

Revision ID: d8f21b630a44
Revises: c4a5d7329b61
Create Date: 2026-06-01 14:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8f21b630a44'
down_revision: Union[str, Sequence[str], None] = 'c4a5d7329b61'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_index(
        op.f('ix_project_template_items_category_id'),
        table_name='project_template_items',
    )
    op.drop_index(
        op.f('ix_project_template_items_subcategory_id'),
        table_name='project_template_items',
    )
    op.drop_column('project_template_items', 'category_id')
    op.drop_column('project_template_items', 'subcategory_id')

    op.drop_index(
        op.f('ix_project_items_source_category_id'),
        table_name='project_items',
    )
    op.drop_index(
        op.f('ix_project_items_source_subcategory_id'),
        table_name='project_items',
    )
    op.drop_column('project_items', 'source_category_id')
    op.drop_column('project_items', 'source_subcategory_id')
    op.drop_index(
        op.f('ix_project_items_source_product_id'),
        table_name='project_items',
    )
    op.drop_constraint(
        op.f('project_items_source_product_id_fkey'),
        table_name='project_items',
        type_='foreignkey',
    )
    op.alter_column(
        'project_items',
        'source_product_id',
        new_column_name='product_id',
    )
    op.create_index(
        op.f('ix_project_items_product_id'),
        'project_items',
        ['product_id'],
        unique=False,
    )
    op.create_foreign_key(
        op.f('project_items_product_id_fkey'),
        'project_items',
        'products',
        ['product_id'],
        ['id'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        op.f('project_items_product_id_fkey'),
        table_name='project_items',
        type_='foreignkey',
    )
    op.drop_index(op.f('ix_project_items_product_id'), table_name='project_items')
    op.alter_column(
        'project_items',
        'product_id',
        new_column_name='source_product_id',
    )
    op.create_index(
        op.f('ix_project_items_source_product_id'),
        'project_items',
        ['source_product_id'],
        unique=False,
    )
    op.create_foreign_key(
        op.f('project_items_source_product_id_fkey'),
        'project_items',
        'products',
        ['source_product_id'],
        ['id'],
    )

    op.add_column(
        'project_items',
        sa.Column('source_subcategory_id', sa.Integer(), nullable=True),
    )
    op.add_column(
        'project_items',
        sa.Column('source_category_id', sa.Integer(), nullable=True),
    )
    op.execute(
        """
        UPDATE project_items
        SET source_subcategory_id = products.subcategory_id,
            source_category_id = subcategories.category_id
        FROM products
        JOIN subcategories ON subcategories.id = products.subcategory_id
        WHERE products.id = project_items.source_product_id
        """
    )
    op.alter_column('project_items', 'source_subcategory_id', nullable=False)
    op.alter_column('project_items', 'source_category_id', nullable=False)
    op.create_foreign_key(
        op.f('project_items_source_subcategory_id_fkey'),
        'project_items',
        'subcategories',
        ['source_subcategory_id'],
        ['id'],
    )
    op.create_foreign_key(
        op.f('project_items_source_category_id_fkey'),
        'project_items',
        'categories',
        ['source_category_id'],
        ['id'],
    )
    op.create_index(
        op.f('ix_project_items_source_subcategory_id'),
        'project_items',
        ['source_subcategory_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_project_items_source_category_id'),
        'project_items',
        ['source_category_id'],
        unique=False,
    )

    op.add_column(
        'project_template_items',
        sa.Column('subcategory_id', sa.Integer(), nullable=True),
    )
    op.add_column(
        'project_template_items',
        sa.Column('category_id', sa.Integer(), nullable=True),
    )
    op.execute(
        """
        UPDATE project_template_items
        SET subcategory_id = products.subcategory_id,
            category_id = subcategories.category_id
        FROM products
        JOIN subcategories ON subcategories.id = products.subcategory_id
        WHERE products.id = project_template_items.product_id
        """
    )
    op.alter_column('project_template_items', 'subcategory_id', nullable=False)
    op.alter_column('project_template_items', 'category_id', nullable=False)
    op.create_foreign_key(
        op.f('project_template_items_subcategory_id_fkey'),
        'project_template_items',
        'subcategories',
        ['subcategory_id'],
        ['id'],
    )
    op.create_foreign_key(
        op.f('project_template_items_category_id_fkey'),
        'project_template_items',
        'categories',
        ['category_id'],
        ['id'],
    )
    op.create_index(
        op.f('ix_project_template_items_subcategory_id'),
        'project_template_items',
        ['subcategory_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_project_template_items_category_id'),
        'project_template_items',
        ['category_id'],
        unique=False,
    )
