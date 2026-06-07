"""create analytics schema and views

Revision ID: 6a7b8c9d0e1f
Revises: 9c1f2e3d4a5b
Create Date: 2026-06-07 00:00:00.000000

"""

from pathlib import Path
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '6a7b8c9d0e1f'
down_revision: Union[str, Sequence[str], None] = '9c1f2e3d4a5b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ANALYTICS_SQL_DIR = Path(__file__).resolve().parents[3] / 'analytics' / 'sql'

UPGRADE_SQL_FILES = (
    'schema.sql',
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
    'vw_project_items_fact',
    'vw_project_summary',
    'vw_transactions_fact',
)


def _read_analytics_sql(filename: str) -> str:
    path = ANALYTICS_SQL_DIR / filename
    if not path.is_file():
        raise RuntimeError(f'Analytics SQL file not found: {path}')
    return path.read_text(encoding='utf-8')


def upgrade() -> None:
    """Upgrade schema."""
    for filename in UPGRADE_SQL_FILES:
        op.execute(_read_analytics_sql(filename))


def downgrade() -> None:
    """Downgrade schema."""
    for view_name in VIEW_NAMES:
        op.execute(f'drop view if exists analytics.{view_name}')

    op.execute('drop schema if exists analytics')
