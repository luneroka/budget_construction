from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProjectItemBase(BaseModel):
    project_id: int
    template_item_id: int | None = None
    source_category_id: int
    source_subcategory_id: int
    source_product_id: int
    parent_item_id: int | None = None
    name: str
    is_custom: bool = False
    is_breakdown_item: bool = False
    sort_order: int = 0


class ProjectItemCreate(ProjectItemBase):
    pass


class ProjectItemUpdate(BaseModel):
    source_category_id: int | None = None
    source_subcategory_id: int | None = None
    source_product_id: int | None = None
    parent_item_id: int | None = None
    name: str | None = None
    is_custom: bool | None = None
    is_breakdown_item: bool | None = None
    sort_order: int | None = None


class ProjectItemRead(ProjectItemBase):
    id: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ProjectItemWithChildren(ProjectItemRead):
    child_items: list['ProjectItemWithChildren']
