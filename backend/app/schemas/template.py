from __future__ import annotations
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TemplateBase(BaseModel):
    name: str
    description: str | None = None


class TemplateCreate(TemplateBase):
    is_active: bool = True


class TemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class TemplateRead(TemplateBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
