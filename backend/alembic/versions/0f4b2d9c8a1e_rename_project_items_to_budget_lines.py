"""rename project items to budget lines

Revision ID: 0f4b2d9c8a1e
Revises: 6a7b8c9d0e1f
Create Date: 2026-06-12 00:00:00.000000

"""

from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0f4b2d9c8a1e'
down_revision: Union[str, Sequence[str], None] = '6a7b8c9d0e1f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ANALYTICS_SQL_DIR = Path(__file__).resolve().parents[2] / 'analytics' / 'sql'
ANALYTICS_SQL_FILES = (
    'vw_transactions_fact.sql',
    'vw_project_summary.sql',
    'vw_project_items_fact.sql',
    'vw_supplier_performance.sql',
    'vw_monthly_cashflow.sql',
    'vw_monthly_invoice_activity.sql',
)
OLD_VIEW_NAMES = (
    'vw_monthly_invoice_activity',
    'vw_monthly_cashflow',
    'vw_supplier_performance',
    'vw_project_items_fact',
    'vw_project_summary',
    'vw_transactions_fact',
)
NEW_VIEW_NAMES = (
    'vw_monthly_invoice_activity',
    'vw_monthly_cashflow',
    'vw_supplier_performance',
    'vw_budget_lines_fact',
    'vw_project_summary',
    'vw_transactions_fact',
)


def _read_analytics_sql(filename: str) -> str:
    path = ANALYTICS_SQL_DIR / filename
    if not path.is_file():
        raise RuntimeError(f'Analytics SQL file not found: {path}')
    return path.read_text(encoding='utf-8')


def _budget_line_view_sql(filename: str) -> str:
    return (
        _read_analytics_sql(filename)
        .replace('project_items', 'budget_lines')
        .replace('project_item_id', 'budget_line_id')
        .replace('project_item_name', 'budget_line_name')
        .replace('project_item_count', 'budget_line_count')
        .replace('Project Items', 'Budget Lines')
        .replace('project item', 'budget line')
    )


def _drop_analytics_views(view_names: tuple[str, ...]) -> None:
    for view_name in view_names:
        op.execute(f'drop view if exists analytics.{view_name}')


def _create_budget_line_trigger() -> None:
    op.execute("""
        CREATE FUNCTION enforce_budget_line_budgeting_mode()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.deleted_at IS NULL THEN
                PERFORM pg_advisory_xact_lock(NEW.project_id, NEW.product_id);

                IF EXISTS (
                    SELECT 1
                    FROM budget_lines
                    WHERE project_id = NEW.project_id
                      AND product_id = NEW.product_id
                      AND deleted_at IS NULL
                      AND id IS DISTINCT FROM NEW.id
                      AND (
                          item_type <> NEW.item_type
                          OR NEW.item_type = 'product'::budget_line_type
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
        CREATE TRIGGER trg_budget_lines_enforce_budgeting_mode
        BEFORE INSERT OR UPDATE OF project_id, product_id, item_type, deleted_at
        ON budget_lines
        FOR EACH ROW
        EXECUTE FUNCTION enforce_budget_line_budgeting_mode();
        """)


def _create_project_item_trigger() -> None:
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


def upgrade() -> None:
    """Upgrade schema."""
    _drop_analytics_views(OLD_VIEW_NAMES)

    op.execute(
        'DROP TRIGGER IF EXISTS trg_project_items_enforce_budgeting_mode ON project_items'
    )
    op.execute('DROP FUNCTION IF EXISTS enforce_project_item_budgeting_mode()')

    op.add_column('projects', sa.Column('template_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f('projects_template_id_fkey'),
        'projects',
        'templates',
        ['template_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index(
        op.f('ix_projects_template_id'),
        'projects',
        ['template_id'],
        unique=False,
    )
    op.execute("""
        UPDATE projects AS p
        SET template_id = inferred.template_id
        FROM (
            SELECT bl.project_id, min(ti.template_id) AS template_id
            FROM project_items AS bl
            JOIN template_items AS ti ON ti.id = bl.template_item_id
            WHERE bl.deleted_at IS NULL
            GROUP BY bl.project_id
            HAVING count(DISTINCT ti.template_id) = 1
        ) AS inferred
        WHERE p.id = inferred.project_id
          AND p.template_id IS NULL
        """)

    op.rename_table('project_items', 'budget_lines')
    op.execute('ALTER TYPE project_item_type RENAME TO budget_line_type')
    op.alter_column(
        'transactions',
        'project_item_id',
        new_column_name='budget_line_id',
        existing_type=sa.Integer(),
        existing_nullable=False,
    )

    rename_statements = (
        'ALTER INDEX IF EXISTS ix_project_items_id RENAME TO ix_budget_lines_id',
        'ALTER INDEX IF EXISTS ix_project_items_project_id RENAME TO ix_budget_lines_project_id',
        'ALTER INDEX IF EXISTS ix_project_items_template_item_id RENAME TO ix_budget_lines_template_item_id',
        'ALTER INDEX IF EXISTS ix_project_items_product_id RENAME TO ix_budget_lines_product_id',
        'ALTER INDEX IF EXISTS uq_project_items_project_id_product_id_product_type RENAME TO uq_budget_lines_project_id_product_id_product_type',
        'ALTER INDEX IF EXISTS ix_transactions_project_item_id RENAME TO ix_transactions_budget_line_id',
        'ALTER INDEX IF EXISTS uq_transactions_project_item_selected_budget RENAME TO uq_transactions_budget_line_selected_budget',
    )
    for statement in rename_statements:
        op.execute(statement)

    constraint_renames = (
        (
            'budget_lines',
            'project_items_project_id_fkey',
            'budget_lines_project_id_fkey',
        ),
        (
            'budget_lines',
            'project_items_template_item_id_fkey',
            'budget_lines_template_item_id_fkey',
        ),
        (
            'budget_lines',
            'project_items_product_id_fkey',
            'budget_lines_product_id_fkey',
        ),
        (
            'transactions',
            'transactions_project_item_id_fkey',
            'transactions_budget_line_id_fkey',
        ),
    )
    for table_name, old_name, new_name in constraint_renames:
        op.execute(f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = '{old_name}'
                      AND conrelid = '{table_name}'::regclass
                ) THEN
                    ALTER TABLE {table_name}
                    RENAME CONSTRAINT {old_name} TO {new_name};
                END IF;
            END
            $$;
            """)

    _create_budget_line_trigger()

    for filename in ANALYTICS_SQL_FILES:
        op.execute(_budget_line_view_sql(filename))


def downgrade() -> None:
    """Downgrade schema."""
    _drop_analytics_views(NEW_VIEW_NAMES)

    op.execute(
        'DROP TRIGGER IF EXISTS trg_budget_lines_enforce_budgeting_mode ON budget_lines'
    )
    op.execute('DROP FUNCTION IF EXISTS enforce_budget_line_budgeting_mode()')

    constraint_renames = (
        (
            'budget_lines',
            'budget_lines_project_id_fkey',
            'project_items_project_id_fkey',
        ),
        (
            'budget_lines',
            'budget_lines_template_item_id_fkey',
            'project_items_template_item_id_fkey',
        ),
        (
            'budget_lines',
            'budget_lines_product_id_fkey',
            'project_items_product_id_fkey',
        ),
        (
            'transactions',
            'transactions_budget_line_id_fkey',
            'transactions_project_item_id_fkey',
        ),
    )
    for table_name, old_name, new_name in constraint_renames:
        op.execute(f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = '{old_name}'
                      AND conrelid = '{table_name}'::regclass
                ) THEN
                    ALTER TABLE {table_name}
                    RENAME CONSTRAINT {old_name} TO {new_name};
                END IF;
            END
            $$;
            """)

    rename_statements = (
        'ALTER INDEX IF EXISTS ix_budget_lines_id RENAME TO ix_project_items_id',
        'ALTER INDEX IF EXISTS ix_budget_lines_project_id RENAME TO ix_project_items_project_id',
        'ALTER INDEX IF EXISTS ix_budget_lines_template_item_id RENAME TO ix_project_items_template_item_id',
        'ALTER INDEX IF EXISTS ix_budget_lines_product_id RENAME TO ix_project_items_product_id',
        'ALTER INDEX IF EXISTS uq_budget_lines_project_id_product_id_product_type RENAME TO uq_project_items_project_id_product_id_product_type',
        'ALTER INDEX IF EXISTS ix_transactions_budget_line_id RENAME TO ix_transactions_project_item_id',
        'ALTER INDEX IF EXISTS uq_transactions_budget_line_selected_budget RENAME TO uq_transactions_project_item_selected_budget',
    )
    for statement in rename_statements:
        op.execute(statement)

    op.alter_column(
        'transactions',
        'budget_line_id',
        new_column_name='project_item_id',
        existing_type=sa.Integer(),
        existing_nullable=False,
    )
    op.execute('ALTER TYPE budget_line_type RENAME TO project_item_type')
    op.rename_table('budget_lines', 'project_items')

    op.drop_index(op.f('ix_projects_template_id'), table_name='projects')
    op.drop_constraint(
        op.f('projects_template_id_fkey'), 'projects', type_='foreignkey'
    )
    op.drop_column('projects', 'template_id')

    _create_project_item_trigger()

    for filename in ANALYTICS_SQL_FILES:
        op.execute(_read_analytics_sql(filename))
