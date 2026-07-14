from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class SupplierDocumentRead(BaseModel):
    id: int
    supplier_id: int
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


class SupplierDocumentListRead(SupplierDocumentRead):
    type: Literal['supplier_document'] = 'supplier_document'
    supplier_name: str
