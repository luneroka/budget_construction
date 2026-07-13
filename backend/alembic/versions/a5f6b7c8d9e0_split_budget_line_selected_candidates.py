"""split budget line selected candidates

Revision ID: a5f6b7c8d9e0
Revises: 3b0e4d2f6a91
Create Date: 2026-07-06 00:00:00.000000

"""

from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a5f6b7c8d9e0'
down_revision: Union[str, Sequence[str], None] = '3b0e4d2f6a91'
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
VIEW_NAMES = (
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


def _single_selected_budget_view_sql(filename: str) -> str:
    sql = (
        _budget_line_view_sql(filename)
        .replace(
            't.is_selected_budget is true',
            'pi.selected_budget_transaction_id = t.id',
        )
        .replace(
            't.is_selected_budget,',
            '(pi.selected_budget_transaction_id = t.id) as is_selected_budget,',
        )
    )
    if filename != 'vw_transactions_fact.sql':
        return sql

    return sql.replace(
        't.invoice_status,\n    (pi.selected_budget_transaction_id = t.id)',
        't.invoice_status,\n'
        '    t.invoice_type,\n'
        '    (pi.selected_budget_transaction_id = t.id)',
    )


def _composite_selected_budget_view_sql(filename: str) -> str:
    selected_expression = (
        '(\n'
        '        pi.selected_quote_transaction_id = t.id\n'
        '        or pi.selected_diy_estimate_transaction_id = t.id\n'
        '    )'
    )
    sql = (
        _budget_line_view_sql(filename)
        .replace('t.is_selected_budget is true', f'{selected_expression} is true')
        .replace(
            't.is_selected_budget,',
            f'{selected_expression} as is_selected_budget,',
        )
    )
    if filename != 'vw_transactions_fact.sql':
        return sql

    return sql.replace(
        't.invoice_status,\n    (\n'
        '        pi.selected_quote_transaction_id = t.id',
        't.invoice_status,\n'
        '    t.invoice_type,\n'
        '    (\n'
        '        pi.selected_quote_transaction_id = t.id',
    )


def _drop_analytics_views() -> None:
    for view_name in VIEW_NAMES:
        op.execute(f'drop view if exists analytics.{view_name}')


def _drop_single_selected_budget_trigger() -> None:
    op.execute(
        'DROP TRIGGER IF EXISTS '
        'trg_budget_lines_enforce_selected_budget_transaction ON budget_lines'
    )
    op.execute(
        'DROP FUNCTION IF EXISTS enforce_budget_line_selected_budget_transaction()'
    )


def _create_single_selected_budget_trigger() -> None:
    op.execute("""
        CREATE FUNCTION enforce_budget_line_selected_budget_transaction()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.selected_budget_transaction_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1
                    FROM transactions t
                    WHERE t.id = NEW.selected_budget_transaction_id
                      AND t.budget_line_id = NEW.id
                      AND t.deleted_at IS NULL
                      AND t.transaction_type IN (
                          'quote'::transaction_type,
                          'diy_estimate'::transaction_type
                      )
                ) THEN
                    RAISE EXCEPTION
                        'selected budget transaction must be an active quote or DIY estimate on the same budget line';
                END IF;
            END IF;

            RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
        """)
    op.execute("""
        CREATE TRIGGER trg_budget_lines_enforce_selected_budget_transaction
        BEFORE INSERT OR UPDATE OF selected_budget_transaction_id
        ON budget_lines
        FOR EACH ROW
        EXECUTE FUNCTION enforce_budget_line_selected_budget_transaction();
        """)


def _create_composite_selected_budget_trigger() -> None:
    op.execute("""
        CREATE FUNCTION enforce_budget_line_selected_budget_candidates()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.selected_quote_transaction_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1
                    FROM transactions t
                    WHERE t.id = NEW.selected_quote_transaction_id
                      AND t.budget_line_id = NEW.id
                      AND t.deleted_at IS NULL
                      AND t.transaction_type = 'quote'::transaction_type
                      AND t.quote_status = 'validated'::quote_status
                ) THEN
                    RAISE EXCEPTION
                        'selected quote must be an active validated quote on the same budget line';
                END IF;
            END IF;

            IF NEW.selected_diy_estimate_transaction_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1
                    FROM transactions t
                    WHERE t.id = NEW.selected_diy_estimate_transaction_id
                      AND t.budget_line_id = NEW.id
                      AND t.deleted_at IS NULL
                      AND t.transaction_type = 'diy_estimate'::transaction_type
                ) THEN
                    RAISE EXCEPTION
                        'selected DIY estimate must be an active DIY estimate on the same budget line';
                END IF;
            END IF;

            RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
        """)
    op.execute("""
        CREATE TRIGGER trg_budget_lines_enforce_selected_budget_candidates
        BEFORE INSERT OR UPDATE OF
            selected_quote_transaction_id,
            selected_diy_estimate_transaction_id
        ON budget_lines
        FOR EACH ROW
        EXECUTE FUNCTION enforce_budget_line_selected_budget_candidates();
        """)


def _drop_composite_selected_budget_trigger() -> None:
    op.execute(
        'DROP TRIGGER IF EXISTS '
        'trg_budget_lines_enforce_selected_budget_candidates ON budget_lines'
    )
    op.execute(
        'DROP FUNCTION IF EXISTS enforce_budget_line_selected_budget_candidates()'
    )


def upgrade() -> None:
    """Upgrade schema."""
    _drop_analytics_views()

    op.add_column(
        'budget_lines',
        sa.Column('selected_quote_transaction_id', sa.Integer(), nullable=True),
    )
    op.add_column(
        'budget_lines',
        sa.Column(
            'selected_diy_estimate_transaction_id',
            sa.Integer(),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        op.f('budget_lines_selected_quote_transaction_id_fkey'),
        'budget_lines',
        'transactions',
        ['selected_quote_transaction_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_foreign_key(
        op.f('budget_lines_selected_diy_estimate_transaction_id_fkey'),
        'budget_lines',
        'transactions',
        ['selected_diy_estimate_transaction_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index(
        'uq_budget_lines_selected_quote_transaction',
        'budget_lines',
        ['selected_quote_transaction_id'],
        unique=True,
        postgresql_where=sa.text(
            'selected_quote_transaction_id IS NOT NULL AND deleted_at IS NULL'
        ),
    )
    op.create_index(
        'uq_budget_lines_selected_diy_estimate_transaction',
        'budget_lines',
        ['selected_diy_estimate_transaction_id'],
        unique=True,
        postgresql_where=sa.text(
            'selected_diy_estimate_transaction_id IS NOT NULL '
            'AND deleted_at IS NULL'
        ),
    )

    op.execute("""
        UPDATE budget_lines AS bl
        SET selected_quote_transaction_id = bl.selected_budget_transaction_id
        FROM transactions AS t
        WHERE t.id = bl.selected_budget_transaction_id
          AND t.transaction_type = 'quote'
        """)
    op.execute("""
        UPDATE budget_lines AS bl
        SET selected_diy_estimate_transaction_id = bl.selected_budget_transaction_id
        FROM transactions AS t
        WHERE t.id = bl.selected_budget_transaction_id
          AND t.transaction_type = 'diy_estimate'
        """)

    _drop_single_selected_budget_trigger()
    op.drop_index(
        'uq_budget_lines_selected_budget_transaction',
        table_name='budget_lines',
    )
    op.drop_constraint(
        op.f('budget_lines_selected_budget_transaction_id_fkey'),
        'budget_lines',
        type_='foreignkey',
    )
    op.drop_column('budget_lines', 'selected_budget_transaction_id')
    _create_composite_selected_budget_trigger()

    for filename in ANALYTICS_SQL_FILES:
        op.execute(_composite_selected_budget_view_sql(filename))


def downgrade() -> None:
    """Downgrade schema."""
    _drop_analytics_views()

    op.add_column(
        'budget_lines',
        sa.Column('selected_budget_transaction_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        op.f('budget_lines_selected_budget_transaction_id_fkey'),
        'budget_lines',
        'transactions',
        ['selected_budget_transaction_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index(
        'uq_budget_lines_selected_budget_transaction',
        'budget_lines',
        ['selected_budget_transaction_id'],
        unique=True,
        postgresql_where=sa.text(
            'selected_budget_transaction_id IS NOT NULL AND deleted_at IS NULL'
        ),
    )
    op.execute("""
        UPDATE budget_lines
        SET selected_budget_transaction_id = coalesce(
            selected_quote_transaction_id,
            selected_diy_estimate_transaction_id
        )
        """)

    _drop_composite_selected_budget_trigger()
    op.drop_index(
        'uq_budget_lines_selected_diy_estimate_transaction',
        table_name='budget_lines',
    )
    op.drop_index(
        'uq_budget_lines_selected_quote_transaction',
        table_name='budget_lines',
    )
    op.drop_constraint(
        op.f('budget_lines_selected_diy_estimate_transaction_id_fkey'),
        'budget_lines',
        type_='foreignkey',
    )
    op.drop_constraint(
        op.f('budget_lines_selected_quote_transaction_id_fkey'),
        'budget_lines',
        type_='foreignkey',
    )
    op.drop_column('budget_lines', 'selected_diy_estimate_transaction_id')
    op.drop_column('budget_lines', 'selected_quote_transaction_id')
    _create_single_selected_budget_trigger()

    for filename in ANALYTICS_SQL_FILES:
        op.execute(_single_selected_budget_view_sql(filename))
