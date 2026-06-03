from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
