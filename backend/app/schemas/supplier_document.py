from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.supplier_document import SupplierDocumentType


class SupplierDocumentFields(BaseModel):
    id: int
    supplier_id: int
    user_id: int
    expiry_date: date | None = None
    original_filename: str
    stored_filename: str
    file_path: str
    mime_type: str
    file_size: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SupplierDocumentRead(SupplierDocumentFields):
    type: SupplierDocumentType


# On the Documents page `type` already tells transaction documents from
# supplier documents, so the supplier document's own type is `document_type`.
class SupplierDocumentListRead(SupplierDocumentFields):
    type: Literal['supplier_document'] = 'supplier_document'
    document_type: SupplierDocumentType
    supplier_name: str


# Only the type and the expiry date change; the file stays as uploaded.
# An omitted field is left as it is; `expiry_date: null` clears the expiry.
class SupplierDocumentUpdate(BaseModel):
    type: SupplierDocumentType | None = None
    expiry_date: date | None = None

    @field_validator('type')
    @classmethod
    def validate_type(
        cls, value: SupplierDocumentType | None
    ) -> SupplierDocumentType | None:
        if value is None:
            raise ValueError('type cannot be null')
        return value
