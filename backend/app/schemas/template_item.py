from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.product import ProductWithHierarchy


class TemplateItemBase(BaseModel):
    product_id: int
    default_name: str
    sort_order: int = 0
    is_required: bool = True


class TemplateItemCreate(TemplateItemBase):
    pass


class TemplateItemUpdate(BaseModel):
    product_id: int | None = None
    default_name: str | None = None
    sort_order: int | None = None
    is_required: bool | None = None


class TemplateItemRead(TemplateItemBase):
    id: int
    template_id: int
    product: ProductWithHierarchy
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
