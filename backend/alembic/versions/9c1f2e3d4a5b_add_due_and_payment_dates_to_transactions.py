"""add due and payment dates to transactions

Revision ID: 9c1f2e3d4a5b
Revises: 1b2c3d4e5f6a
Create Date: 2026-06-06 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '9c1f2e3d4a5b'
down_revision: Union[str, Sequence[str], None] = '1b2c3d4e5f6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        'transactions',
        'transaction_date',
        existing_type=sa.Date(),
        existing_nullable=False,
        new_column_name='issued_date',
    )
    op.add_column('transactions', sa.Column('due_date', sa.Date(), nullable=True))
    op.add_column('transactions', sa.Column('payment_date', sa.Date(), nullable=True))
    op.create_check_constraint(
        'ck_transactions_due_date_only_for_quotes_or_invoices',
        'transactions',
        "transaction_type IN ('quote', 'invoice') OR due_date IS NULL",
    )
    op.create_check_constraint(
        'ck_transactions_payment_date_only_for_invoices',
        'transactions',
        "transaction_type = 'invoice' OR payment_date IS NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        'ck_transactions_payment_date_only_for_invoices',
        'transactions',
        type_='check',
    )
    op.drop_constraint(
        'ck_transactions_due_date_only_for_quotes_or_invoices',
        'transactions',
        type_='check',
    )
    op.drop_column('transactions', 'payment_date')
    op.drop_column('transactions', 'due_date')
    op.alter_column(
        'transactions',
        'issued_date',
        existing_type=sa.Date(),
        existing_nullable=False,
        new_column_name='transaction_date',
    )
