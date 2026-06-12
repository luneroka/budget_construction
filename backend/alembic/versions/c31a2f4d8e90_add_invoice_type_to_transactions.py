"""add invoice type to transactions

Revision ID: c31a2f4d8e90
Revises: b7e4c8d9a123
Create Date: 2026-06-12 00:00:00.000000

"""

from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c31a2f4d8e90'
down_revision: Union[str, Sequence[str], None] = 'b7e4c8d9a123'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ANALYTICS_SQL_DIR = Path(__file__).resolve().parents[3] / 'analytics' / 'sql'
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


def _current_view_sql(filename: str) -> str:
    return (
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


def _invoice_type_view_sql(filename: str) -> str:
    sql = _current_view_sql(filename)
    if filename != 'vw_transactions_fact.sql':
        return sql

    return sql.replace(
        't.invoice_status,\n    (pi.selected_budget_transaction_id = t.id)',
        't.invoice_status,\n'
        '    t.invoice_type,\n'
        '    (pi.selected_budget_transaction_id = t.id)',
    )


def _drop_analytics_views() -> None:
    for view_name in VIEW_NAMES:
        op.execute(f'drop view if exists analytics.{view_name}')


invoice_type_enum = sa.Enum(
    'full',
    'deposit',
    'interim',
    'balance',
    name='invoice_type',
)


def upgrade() -> None:
    """Upgrade schema."""
    _drop_analytics_views()

    invoice_type_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'transactions',
        sa.Column('invoice_type', invoice_type_enum, nullable=True),
    )
    op.execute("""
        UPDATE transactions
        SET invoice_type = 'full'
        WHERE transaction_type = 'invoice'
        """)
    op.create_check_constraint(
        'ck_transactions_invoice_type_only_for_invoices',
        'transactions',
        "transaction_type = 'invoice' OR invoice_type IS NULL",
    )

    for filename in ANALYTICS_SQL_FILES:
        op.execute(_invoice_type_view_sql(filename))


def downgrade() -> None:
    """Downgrade schema."""
    _drop_analytics_views()

    op.drop_constraint(
        'ck_transactions_invoice_type_only_for_invoices',
        'transactions',
        type_='check',
    )
    op.drop_column('transactions', 'invoice_type')
    invoice_type_enum.drop(op.get_bind(), checkfirst=True)

    for filename in ANALYTICS_SQL_FILES:
        op.execute(_current_view_sql(filename))
