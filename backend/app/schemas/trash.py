from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.models.transaction import TransactionType


class TrashTransactionRead(BaseModel):
    type: Literal['transaction']
    id: int
    project_id: int
    budget_line_id: int
    name: str
    supplier_name: str | None = None
    product_name: str
    amount_ttc: Decimal
    deleted_at: datetime


class TrashDocumentRead(BaseModel):
    type: Literal['document']
    id: int
    project_id: int
    transaction_id: int
    name: str
    transaction_name: str
    transaction_type: TransactionType
    transaction_deleted_at: datetime | None = None
    supplier_name: str | None = None
    deleted_at: datetime
    can_restore: bool
    restore_blocked_reason: str | None = None


class TrashSupplierRead(BaseModel):
    type: Literal['supplier']
    id: int
    project_id: int
    name: str
    linked_transaction_count: int
    deleted_at: datetime


class TrashSupplierDocumentRead(BaseModel):
    type: Literal['supplier_document']
    id: int
    project_id: int
    supplier_id: int
    name: str
    supplier_name: str
    supplier_deleted_at: datetime | None = None
    deleted_at: datetime
    can_restore: bool
    restore_blocked_reason: str | None = None


TrashItemRead = (
    TrashTransactionRead
    | TrashDocumentRead
    | TrashSupplierRead
    | TrashSupplierDocumentRead
)
