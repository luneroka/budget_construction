from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.transaction import (
    API_TRANSACTION_TYPES,
    TRANSACTION_REFERENCE_MAX_LENGTH,
    TRANSACTION_TITLE_MAX_LENGTH,
    InvoiceStatus,
    InvoiceType,
    PaymentMethod,
    QuoteStatus,
    TransactionType,
)


def normalize_optional_text(value: Any) -> Any:
    """Trim free text; an empty value is stored as null."""
    if isinstance(value, str):
        return value.strip() or None
    return value


TransactionTitle = Annotated[
    str | None, Field(max_length=TRANSACTION_TITLE_MAX_LENGTH)
]
TransactionReference = Annotated[
    str | None, Field(max_length=TRANSACTION_REFERENCE_MAX_LENGTH)
]


def _validate_statuses(
    transaction_type: TransactionType,
    quote_status: QuoteStatus | None,
    invoice_status: InvoiceStatus | None,
    invoice_type: InvoiceType | None,
    payment_method: PaymentMethod | None,
    due_date: date | None,
    payment_date: date | None,
) -> None:
    if transaction_type not in API_TRANSACTION_TYPES:
        # Refused with its own stable code by the repository.
        return
    if transaction_type != TransactionType.quote and quote_status is not None:
        raise ValueError('quote_status is only allowed for quote transactions')
    if transaction_type != TransactionType.invoice and invoice_status is not None:
        raise ValueError('invoice_status is only allowed for invoice transactions')
    if transaction_type != TransactionType.invoice and invoice_type is not None:
        raise ValueError('invoice_type is only allowed for invoice transactions')
    if transaction_type != TransactionType.invoice and payment_method is not None:
        raise ValueError('payment_method is only allowed for invoice transactions')
    if transaction_type != TransactionType.invoice and payment_date is not None:
        raise ValueError('payment_date is only allowed for invoice transactions')


class TransactionBase(BaseModel):
    lot_id: int
    supplier_id: int | None = None
    transaction_type: TransactionType
    title: TransactionTitle = None
    reference: TransactionReference = None
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
    invoice_type: InvoiceType | None = None
    payment_method: PaymentMethod | None = None

    @field_validator('title', 'reference', mode='before')
    @classmethod
    def normalize_text(cls, value: Any) -> Any:
        return normalize_optional_text(value)

    @model_validator(mode='after')
    def validate_statuses(self) -> TransactionBase:
        _validate_statuses(
            self.transaction_type,
            self.quote_status,
            self.invoice_status,
            self.invoice_type,
            self.payment_method,
            self.due_date,
            self.payment_date,
        )
        return self


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    lot_id: int | None = None
    supplier_id: int | None = None
    title: TransactionTitle = None
    reference: TransactionReference = None
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
    invoice_type: InvoiceType | None = None
    payment_method: PaymentMethod | None = None

    @field_validator('title', 'reference', mode='before')
    @classmethod
    def normalize_text(cls, value: Any) -> Any:
        return normalize_optional_text(value)


class TransactionReadBase(BaseModel):
    lot_id: int
    supplier_id: int | None = None
    transaction_type: TransactionType
    title: str | None = None
    reference: str | None = None
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
    invoice_type: InvoiceType | None = None
    payment_method: PaymentMethod | None = None


class TransactionRead(TransactionReadBase):
    id: int
    project_id: int
    has_documents: bool = False
    document_count: int = 0
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ProjectTransactionRead(TransactionRead):
    lot_code: str
    lot_designation: str
    supplier_name: str | None = None
    document_original_filenames: list[str] = Field(default_factory=list)
