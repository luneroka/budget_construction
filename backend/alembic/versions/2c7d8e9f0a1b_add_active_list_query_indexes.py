"""add active list query indexes

Revision ID: 2c7d8e9f0a1b
Revises: f6a7b8c9d0e2
Create Date: 2026-07-10

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '2c7d8e9f0a1b'
down_revision: str | Sequence[str] | None = 'f6a7b8c9d0e2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        'ix_transactions_active_budget_line_issued_date_id',
        'transactions',
        ['budget_line_id', 'issued_date', 'id'],
        unique=False,
        postgresql_where=sa.text('deleted_at IS NULL'),
    )
    op.create_index(
        'ix_documents_active_user_created_at',
        'documents',
        ['user_id', 'created_at'],
        unique=False,
        postgresql_where=sa.text('deleted_at IS NULL'),
    )


def downgrade() -> None:
    op.drop_index(
        'ix_documents_active_user_created_at',
        table_name='documents',
        postgresql_where=sa.text('deleted_at IS NULL'),
    )
    op.drop_index(
        'ix_transactions_active_budget_line_issued_date_id',
        table_name='transactions',
        postgresql_where=sa.text('deleted_at IS NULL'),
    )
