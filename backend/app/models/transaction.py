from __future__ import annotations

from datetime import date, datetime, UTC
from decimal import Decimal
from typing import TYPE_CHECKING

import enum
from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Numeric,
    ForeignKey,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.budget_line import BudgetLine
    from app.models.supplier import Supplier


class TransactionType(str, enum.Enum):
    quote = 'quote'
    diy_estimate = 'diy_estimate'
    invoice = 'invoice'


class QuoteStatus(str, enum.Enum):
    to_confirm = 'to_confirm'
    to_negotiate = 'to_negotiate'
    validated = 'validated'


class InvoiceStatus(str, enum.Enum):
    unpaid = 'unpaid'
    on_hold = 'on_hold'
    paid = 'paid'


class InvoiceType(str, enum.Enum):
    full = 'full'
    deposit = 'deposit'
    interim = 'interim'
    balance = 'balance'


class PaymentMethod(str, enum.Enum):
    cash = 'cash'
    card = 'card'
    wire = 'wire'


class Transaction(Base):
    __tablename__ = 'transactions'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    budget_line_id: Mapped[int] = mapped_column(
        ForeignKey('budget_lines.id', ondelete='CASCADE'), nullable=False, index=True
    )
    supplier_id: Mapped[int | None] = mapped_column(
        ForeignKey('suppliers.id', ondelete='SET NULL'), nullable=True, index=True
    )
    transaction_type: Mapped[TransactionType] = mapped_column(
        Enum(TransactionType, name='transaction_type'),
        default=TransactionType.quote,
        nullable=False,
    )
    amount_ht: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    vat_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    amount_vat: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    amount_ttc: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    issued_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    quote_status: Mapped[QuoteStatus | None] = mapped_column(
        Enum(QuoteStatus, name='quote_status'),
        nullable=True,
    )

    invoice_status: Mapped[InvoiceStatus | None] = mapped_column(
        Enum(InvoiceStatus, name='invoice_status'),
        nullable=True,
    )

    invoice_type: Mapped[InvoiceType | None] = mapped_column(
        Enum(InvoiceType, name='invoice_type'),
        nullable=True,
    )

    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        Enum(PaymentMethod, name='payment_method'),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC).replace(tzinfo=None),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC).replace(tzinfo=None),
        server_default=func.now(),
        onupdate=lambda: datetime.now(UTC).replace(tzinfo=None),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        CheckConstraint('amount_ht >= 0', name='ck_transactions_amount_ht_positive'),
        CheckConstraint(
            'vat_rate IS NULL OR vat_rate >= 0',
            name='ck_transactions_vat_rate_positive',
        ),
        CheckConstraint(
            'amount_vat IS NULL OR amount_vat >= 0',
            name='ck_transactions_amount_vat_positive',
        ),
        CheckConstraint('amount_ttc >= 0', name='ck_transactions_amount_ttc_positive'),
        CheckConstraint(
            'amount_ttc >= amount_ht',
            name='ck_transactions_ttc_greater_than_ht',
        ),
        CheckConstraint(
            "transaction_type = 'quote' OR quote_status IS NULL",
            name='ck_transactions_quote_status_only_for_quotes',
        ),
        CheckConstraint(
            "transaction_type = 'invoice' OR invoice_status IS NULL",
            name='ck_transactions_invoice_status_only_for_invoices',
        ),
        CheckConstraint(
            "transaction_type = 'invoice' OR invoice_type IS NULL",
            name='ck_transactions_invoice_type_only_for_invoices',
        ),
        CheckConstraint(
            "transaction_type = 'invoice' OR payment_method IS NULL",
            name='ck_transactions_payment_method_only_for_invoices',
        ),
        CheckConstraint(
            "transaction_type IN ('quote', 'invoice') OR due_date IS NULL",
            name='ck_transactions_due_date_only_for_quotes_or_invoices',
        ),
        CheckConstraint(
            "transaction_type = 'invoice' OR payment_date IS NULL",
            name='ck_transactions_payment_date_only_for_invoices',
        ),
    )

    budget_line: Mapped[BudgetLine] = relationship(
        'BudgetLine',
        back_populates='transactions',
        foreign_keys=[budget_line_id],
    )
    documents = relationship(
        'Document',
        back_populates='transaction',
        cascade='all, delete-orphan',
    )
    supplier: Mapped[Supplier | None] = relationship(
        'Supplier', back_populates='transactions'
    )
