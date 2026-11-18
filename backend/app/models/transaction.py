from __future__ import annotations

from datetime import date, datetime
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
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.core.time import utcnow

if TYPE_CHECKING:
    from app.models.lot import Lot
    from app.models.project import Project
    from app.models.supplier import Supplier

TRANSACTION_TITLE_MAX_LENGTH = 255
TRANSACTION_REFERENCE_MAX_LENGTH = 100


class TransactionType(str, enum.Enum):
    quote = 'quote'
    # Legacy: still a value of the PostgreSQL enum, refused by the API and by
    # ck_transactions_type_quote_or_invoice. Dropped by the cleanup migration.
    diy_estimate = 'diy_estimate'
    invoice = 'invoice'


API_TRANSACTION_TYPES = frozenset({TransactionType.quote, TransactionType.invoice})


class QuoteStatus(str, enum.Enum):
    to_confirm = 'to_confirm'
    to_negotiate = 'to_negotiate'
    validated = 'validated'
    rejected = 'rejected'


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

    project_id: Mapped[int] = mapped_column(
        ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True
    )
    lot_id: Mapped[int] = mapped_column(
        ForeignKey('lots.id'), nullable=False, index=True
    )
    # Legacy: set on transactions from before lots, unused by the app.
    budget_line_id: Mapped[int | None] = mapped_column(
        ForeignKey('budget_lines.id', ondelete='CASCADE'), nullable=True, index=True
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
    title: Mapped[str | None] = mapped_column(
        String(TRANSACTION_TITLE_MAX_LENGTH), nullable=True
    )
    reference: Mapped[str | None] = mapped_column(
        String(TRANSACTION_REFERENCE_MAX_LENGTH), nullable=True
    )
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
        default=utcnow,
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utcnow,
        server_default=func.now(),
        onupdate=utcnow,
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Legacy: read by the production analytics views, unused by the app.
    # Dropped by the cleanup migration.
    is_selected_budget: Mapped[bool] = mapped_column(
        default=False, server_default='false', nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "transaction_type IN ('quote', 'invoice')",
            name='ck_transactions_type_quote_or_invoice',
        ),
        Index(
            'ix_transactions_active_budget_line_issued_date_id',
            'budget_line_id',
            'issued_date',
            'id',
            postgresql_where=text('deleted_at IS NULL'),
        ),
        Index(
            'ix_transactions_active_project_lot_issued_date_id',
            'project_id',
            'lot_id',
            'issued_date',
            'id',
            postgresql_where=text('deleted_at IS NULL'),
        ),
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

    project: Mapped[Project] = relationship('Project')
    lot: Mapped[Lot] = relationship('Lot')
    documents = relationship(
        'Document',
        back_populates='transaction',
        cascade='all, delete-orphan',
    )

    @property
    def has_documents(self) -> bool:
        return any(document.deleted_at is None for document in self.documents)

    @property
    def document_count(self) -> int:
        return sum(1 for document in self.documents if document.deleted_at is None)

    supplier: Mapped[Supplier | None] = relationship(
        'Supplier', back_populates='transactions'
    )
