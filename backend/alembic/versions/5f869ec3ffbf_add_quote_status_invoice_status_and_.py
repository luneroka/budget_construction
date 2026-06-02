"""add quote_status, invoice_status and payment_method fields to transactions table

Revision ID: 5f869ec3ffbf
Revises: e69142bc718a
Create Date: 2026-06-02 12:05:46.825211

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '5f869ec3ffbf'
down_revision: Union[str, Sequence[str], None] = 'e69142bc718a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


quote_status = postgresql.ENUM(
    'to_confirm',
    'to_negotiate',
    'validated',
    name='quote_status',
    create_type=False,
)
invoice_status = postgresql.ENUM(
    'unpaid',
    'on_hold',
    'paid',
    name='invoice_status',
    create_type=False,
)
payment_method = postgresql.ENUM(
    'cash',
    'card',
    'wire',
    name='payment_method',
    create_type=False,
)


def upgrade() -> None:
    """Upgrade schema."""
    quote_status.create(op.get_bind(), checkfirst=True)
    invoice_status.create(op.get_bind(), checkfirst=True)
    payment_method.create(op.get_bind(), checkfirst=True)

    op.add_column(
        'transactions',
        sa.Column('quote_status', quote_status, nullable=True),
    )
    op.add_column(
        'transactions',
        sa.Column('invoice_status', invoice_status, nullable=True),
    )
    op.add_column(
        'transactions',
        sa.Column('payment_method', payment_method, nullable=True),
    )
    op.create_check_constraint(
        'ck_transactions_quote_status_only_for_quotes',
        'transactions',
        "transaction_type = 'quote' OR quote_status IS NULL",
    )
    op.create_check_constraint(
        'ck_transactions_invoice_status_only_for_invoices',
        'transactions',
        "transaction_type = 'invoice' OR invoice_status IS NULL",
    )
    op.create_check_constraint(
        'ck_transactions_payment_method_only_for_invoices',
        'transactions',
        "transaction_type = 'invoice' OR payment_method IS NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        'ck_transactions_payment_method_only_for_invoices',
        'transactions',
        type_='check',
    )
    op.drop_constraint(
        'ck_transactions_invoice_status_only_for_invoices',
        'transactions',
        type_='check',
    )
    op.drop_constraint(
        'ck_transactions_quote_status_only_for_quotes',
        'transactions',
        type_='check',
    )
    op.drop_column('transactions', 'payment_method')
    op.drop_column('transactions', 'invoice_status')
    op.drop_column('transactions', 'quote_status')
    payment_method.drop(op.get_bind(), checkfirst=True)
    invoice_status.drop(op.get_bind(), checkfirst=True)
    quote_status.drop(op.get_bind(), checkfirst=True)
