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
    Index,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.project_item import ProjectItem
    from app.models.supplier import Supplier


class TransactionType(str, enum.Enum):
    quote = 'quote'
    diy_estimate = 'diy_estimate'
    invoice = 'invoice'


class Transaction(Base):
    __tablename__ = 'transactions'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    project_item_id: Mapped[int] = mapped_column(
        ForeignKey('project_items.id', ondelete='CASCADE'), nullable=False, index=True
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
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_selected_budget: Mapped[bool] = mapped_column(
        default=False, server_default='false', nullable=False
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
        CheckConstraint(
            "NOT is_selected_budget OR transaction_type IN ('quote', 'diy_estimate')",
            name='ck_transactions_selected_budget_candidate',
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
        Index(
            'uq_transactions_project_item_selected_budget',
            'project_item_id',
            unique=True,
            postgresql_where=text('is_selected_budget AND deleted_at IS NULL'),
        ),
    )

    project_item: Mapped[ProjectItem] = relationship(
        'ProjectItem', back_populates='transactions'
    )
    supplier: Mapped[Supplier | None] = relationship(
        'Supplier', back_populates='transactions'
    )
