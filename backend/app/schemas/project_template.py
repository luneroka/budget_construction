from __future__ import annotations
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.project_template_item import ProjectTemplateItemRead


class ProjectTemplateBase(BaseModel):
    name: str
    description: str | None = None


class ProjectTemplateCreate(ProjectTemplateBase):
    is_active: bool = True


class ProjectTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class ProjectTemplateRead(ProjectTemplateBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProjectTemplateWithItems(ProjectTemplateRead):
    template_items: list[ProjectTemplateItemRead] = Field(default_factory=list)
