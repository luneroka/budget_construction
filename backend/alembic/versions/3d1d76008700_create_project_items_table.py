"""create project_items table

Revision ID: 3d1d76008700
Revises: 8d41008ddfbc
Create Date: 2026-06-01 10:56:56.420044

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3d1d76008700'
down_revision: Union[str, Sequence[str], None] = '8d41008ddfbc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint(
        op.f('project_template_items_template_id_fkey'),
        table_name='project_template_items',
        type_='foreignkey',
    )
    op.drop_index(
        op.f('ix_project_template_items_template_id'),
        table_name='project_template_items',
    )
    op.alter_column(
        'project_template_items',
        'template_id',
        new_column_name='project_template_id',
    )
    op.create_index(
        op.f('ix_project_template_items_project_template_id'),
        'project_template_items',
        ['project_template_id'],
        unique=False,
    )
    op.create_foreign_key(
        op.f('project_template_items_project_template_id_fkey'),
        'project_template_items',
        'project_templates',
        ['project_template_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_table(
        'project_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('template_item_id', sa.Integer(), nullable=True),
        sa.Column('source_category_id', sa.Integer(), nullable=False),
        sa.Column('source_subcategory_id', sa.Integer(), nullable=False),
        sa.Column('source_product_id', sa.Integer(), nullable=False),
        sa.Column('parent_item_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('is_custom', sa.Boolean(), server_default='false', nullable=False),
        sa.Column(
            'is_breakdown_item',
            sa.Boolean(),
            server_default='false',
            nullable=False,
        ),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ['parent_item_id'],
            ['project_items.id'],
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['project_id'],
            ['projects.id'],
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(['source_category_id'], ['categories.id']),
        sa.ForeignKeyConstraint(['source_product_id'], ['products.id']),
        sa.ForeignKeyConstraint(['source_subcategory_id'], ['subcategories.id']),
        sa.ForeignKeyConstraint(
            ['template_item_id'],
            ['project_template_items.id'],
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_project_items_id'), 'project_items', ['id'], unique=False)
    op.create_index(
        op.f('ix_project_items_parent_item_id'),
        'project_items',
        ['parent_item_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_project_items_project_id'),
        'project_items',
        ['project_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_project_items_source_category_id'),
        'project_items',
        ['source_category_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_project_items_source_product_id'),
        'project_items',
        ['source_product_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_project_items_source_subcategory_id'),
        'project_items',
        ['source_subcategory_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_project_items_template_item_id'),
        'project_items',
        ['template_item_id'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f('ix_project_items_template_item_id'),
        table_name='project_items',
    )
    op.drop_index(
        op.f('ix_project_items_source_subcategory_id'),
        table_name='project_items',
    )
    op.drop_index(
        op.f('ix_project_items_source_product_id'),
        table_name='project_items',
    )
    op.drop_index(
        op.f('ix_project_items_source_category_id'),
        table_name='project_items',
    )
    op.drop_index(
        op.f('ix_project_items_project_id'),
        table_name='project_items',
    )
    op.drop_index(
        op.f('ix_project_items_parent_item_id'),
        table_name='project_items',
    )
    op.drop_index(op.f('ix_project_items_id'), table_name='project_items')
    op.drop_table('project_items')
    op.drop_constraint(
        op.f('project_template_items_project_template_id_fkey'),
        table_name='project_template_items',
        type_='foreignkey',
    )
    op.drop_index(
        op.f('ix_project_template_items_project_template_id'),
        table_name='project_template_items',
    )
    op.alter_column(
        'project_template_items',
        'project_template_id',
        new_column_name='template_id',
    )
    op.create_index(
        op.f('ix_project_template_items_template_id'),
        'project_template_items',
        ['template_id'],
        unique=False,
    )
    op.create_foreign_key(
        op.f('project_template_items_template_id_fkey'),
        'project_template_items',
        'project_templates',
        ['template_id'],
        ['id'],
        ondelete='CASCADE',
    )
