from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.product import ProductWithHierarchy


class ProjectItemCreate(BaseModel):
    product_id: int
    parent_item_id: int | None = None
    name: str
    is_custom: bool = False
    sort_order: int = 0


class ProjectItemUpdate(BaseModel):
    parent_item_id: int | None = None
    name: str | None = None
    is_custom: bool | None = None
    sort_order: int | None = None


class ProjectItemRead(BaseModel):
    id: int
    project_id: int
    template_item_id: int | None = None
    product_id: int
    parent_item_id: int | None = None
    name: str
    is_custom: bool
    is_breakdown_item: bool
    sort_order: int
    product: ProductWithHierarchy
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
