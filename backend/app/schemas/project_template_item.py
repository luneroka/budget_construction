from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProjectTemplateItemBase(BaseModel):
    project_template_id: int
    category_id: int | None = None
    subcategory_id: int | None = None
    product_id: int | None = None
    parent_template_item_id: int | None = None
    default_name: str
    sort_order: int = 0
    is_required: bool = True


class ProjectTemplateItemCreate(ProjectTemplateItemBase):
    pass


class ProjectTemplateItemUpdate(BaseModel):
    category_id: int | None = None
    subcategory_id: int | None = None
    product_id: int | None = None
    parent_template_item_id: int | None = None
    default_name: str | None = None
    sort_order: int | None = None
    is_required: bool | None = None


class ProjectTemplateItemRead(ProjectTemplateItemBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProjectTemplateItemWithChildren(ProjectTemplateItemRead):
    child_template_items: list[ProjectTemplateItemWithChildren] = []
