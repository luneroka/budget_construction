from datetime import datetime, date

from pydantic import BaseModel, ConfigDict


class ProjectBase(BaseModel):
    name: str
    description: str | None = None
    location: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    location: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class ProjectRead(ProjectBase):
    id: int
    user_id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
