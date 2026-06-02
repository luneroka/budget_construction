"""add project item type

Revision ID: b2c3a84f91d7
Revises: 70d84b688c5f
Create Date: 2026-06-02 16:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b2c3a84f91d7'
down_revision: Union[str, Sequence[str], None] = '70d84b688c5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


project_item_type = postgresql.ENUM(
    'product',
    'breakdown',
    name='project_item_type',
    create_type=False,
)


def upgrade() -> None:
    """Upgrade schema."""
    project_item_type.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'project_items',
        sa.Column('item_type', project_item_type, nullable=True),
    )
    op.execute("""
        UPDATE project_items
        SET item_type = CASE
            WHEN is_breakdown_item THEN 'breakdown'::project_item_type
            ELSE 'product'::project_item_type
        END
        """)
    op.execute("""
        UPDATE project_items AS parent
        SET item_type = 'breakdown'::project_item_type
        WHERE EXISTS (
            SELECT 1
            FROM project_items AS child
            WHERE child.parent_item_id = parent.id
              AND child.item_type = 'breakdown'::project_item_type
        )
        """)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM project_items
                WHERE deleted_at IS NULL
                GROUP BY project_id, product_id
                HAVING COUNT(DISTINCT item_type) > 1
            ) THEN
                RAISE EXCEPTION
                    'project_items contains mixed product and breakdown budgeting modes';
            END IF;
        END
        $$;
        """)
    op.alter_column('project_items', 'item_type', nullable=False)
    op.create_check_constraint(
        'ck_project_items_product_has_no_parent',
        'project_items',
        "item_type = 'breakdown' OR parent_item_id IS NULL",
    )
    op.create_index(
        'uq_project_items_project_id_product_id_product_type',
        'project_items',
        ['project_id', 'product_id'],
        unique=True,
        postgresql_where=sa.text("item_type = 'product' AND deleted_at IS NULL"),
    )
    op.execute("""
        CREATE FUNCTION enforce_project_item_budgeting_mode()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.deleted_at IS NULL THEN
                PERFORM pg_advisory_xact_lock(NEW.project_id, NEW.product_id);

                IF EXISTS (
                    SELECT 1
                    FROM project_items
                    WHERE project_id = NEW.project_id
                      AND product_id = NEW.product_id
                      AND deleted_at IS NULL
                      AND id IS DISTINCT FROM NEW.id
                      AND (
                          item_type <> NEW.item_type
                          OR NEW.item_type = 'product'::project_item_type
                      )
                ) THEN
                    RAISE EXCEPTION
                        'project product must use either product or breakdown budgeting mode';
                END IF;
            END IF;

            RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
        """)
    op.execute("""
        CREATE TRIGGER trg_project_items_enforce_budgeting_mode
        BEFORE INSERT OR UPDATE OF project_id, product_id, item_type, deleted_at
        ON project_items
        FOR EACH ROW
        EXECUTE FUNCTION enforce_project_item_budgeting_mode();
        """)
    op.drop_column('project_items', 'is_breakdown_item')
    op.drop_column('project_items', 'is_custom')


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("""
        DROP TRIGGER trg_project_items_enforce_budgeting_mode
        ON project_items
        """)
    op.execute('DROP FUNCTION enforce_project_item_budgeting_mode()')
    op.add_column(
        'project_items',
        sa.Column(
            'is_custom',
            sa.Boolean(),
            server_default=sa.text('false'),
            nullable=False,
        ),
    )
    op.add_column(
        'project_items',
        sa.Column(
            'is_breakdown_item',
            sa.Boolean(),
            server_default=sa.text('false'),
            nullable=True,
        ),
    )
    op.execute("""
        UPDATE project_items
        SET is_breakdown_item = item_type = 'breakdown'::project_item_type
        """)
    op.alter_column('project_items', 'is_breakdown_item', nullable=False)
    op.drop_index(
        'uq_project_items_project_id_product_id_product_type',
        table_name='project_items',
    )
    op.drop_constraint(
        'ck_project_items_product_has_no_parent',
        'project_items',
        type_='check',
    )
    op.drop_column('project_items', 'item_type')
    project_item_type.drop(op.get_bind(), checkfirst=True)
