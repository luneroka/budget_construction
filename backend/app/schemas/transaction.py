from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.budget_line import BudgetLineType
from app.models.transaction import (
    InvoiceStatus,
    PaymentMethod,
    QuoteStatus,
    TransactionType,
)


def _validate_statuses(
    transaction_type: TransactionType,
    quote_status: QuoteStatus | None,
    invoice_status: InvoiceStatus | None,
    payment_method: PaymentMethod | None,
    due_date: date | None,
    payment_date: date | None,
) -> None:
    if transaction_type != TransactionType.quote and quote_status is not None:
        raise ValueError('quote_status is only allowed for quote transactions')
    if transaction_type != TransactionType.invoice and invoice_status is not None:
        raise ValueError('invoice_status is only allowed for invoice transactions')
    if transaction_type != TransactionType.invoice and payment_method is not None:
        raise ValueError('payment_method is only allowed for invoice transactions')
    if (
        transaction_type not in {TransactionType.quote, TransactionType.invoice}
        and due_date is not None
    ):
        raise ValueError('due_date is only allowed for quote and invoice transactions')
    if transaction_type != TransactionType.invoice and payment_date is not None:
        raise ValueError('payment_date is only allowed for invoice transactions')


class TransactionBase(BaseModel):
    supplier_id: int | None = None
    transaction_type: TransactionType
    amount_ht: Decimal
    vat_rate: Decimal | None = None
    amount_vat: Decimal | None = None
    amount_ttc: Decimal | None = None
    issued_date: date
    due_date: date | None = None
    payment_date: date | None = None
    description: str | None = None
    quote_status: QuoteStatus | None = None
    invoice_status: InvoiceStatus | None = None
    payment_method: PaymentMethod | None = None

    @model_validator(mode='after')
    def validate_statuses(self) -> TransactionBase:
        _validate_statuses(
            self.transaction_type,
            self.quote_status,
            self.invoice_status,
            self.payment_method,
            self.due_date,
            self.payment_date,
        )
        return self


class TransactionCreate(TransactionBase):
    select_as_budget: bool = False


class TransactionCreateForProduct(TransactionCreate):
    budget_line_name: str | None = None
    budget_line_type: BudgetLineType = BudgetLineType.product


class TransactionUpdate(BaseModel):
    supplier_id: int | None = None
    amount_ht: Decimal | None = None
    vat_rate: Decimal | None = None
    amount_vat: Decimal | None = None
    amount_ttc: Decimal | None = None
    issued_date: date | None = None
    due_date: date | None = None
    payment_date: date | None = None
    description: str | None = None
    quote_status: QuoteStatus | None = None
    invoice_status: InvoiceStatus | None = None
    payment_method: PaymentMethod | None = None


class TransactionReadBase(BaseModel):
    supplier_id: int | None = None
    transaction_type: TransactionType
    amount_ht: Decimal
    vat_rate: Decimal | None = None
    amount_vat: Decimal | None = None
    amount_ttc: Decimal
    issued_date: date
    due_date: date | None = None
    payment_date: date | None = None
    description: str | None = None
    quote_status: QuoteStatus | None = None
    invoice_status: InvoiceStatus | None = None
    payment_method: PaymentMethod | None = None


class TransactionRead(TransactionReadBase):
    id: int
    budget_line_id: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
