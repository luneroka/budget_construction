from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models.transaction import TransactionType


class DocumentRead(BaseModel):
    id: int
    transaction_id: int
    user_id: int
    original_filename: str
    stored_filename: str
    file_path: str
    mime_type: str
    file_size: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class DocumentListRead(DocumentRead):
    type: Literal['document'] = 'document'
    project_id: int
    transaction_type: TransactionType
    transaction_description: str | None = None
    supplier_name: str | None = None
    product_name: str | None = None
    amount_ttc: str | None = None


class DocumentDownloadUrl(BaseModel):
    url: str
