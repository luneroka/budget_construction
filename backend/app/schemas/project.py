from __future__ import annotations

from datetime import datetime, date

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.models.project import ProjectStatus
from app.schemas.budget_line import BudgetLineRead


class ProjectBase(BaseModel):
    name: str
    description: str | None = None
    location: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    project_status: ProjectStatus = ProjectStatus.active

    @model_validator(mode='after')
    def validate_dates(self) -> ProjectBase:
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date < self.start_date
        ):
            raise ValueError('end_date must be greater than or equal to start_date')
        return self


class ProjectCreate(ProjectBase):
    pass


class ProjectFromTemplateCreate(ProjectBase):
    template_id: int


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    location: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    project_status: ProjectStatus | None = None

    @model_validator(mode='after')
    def validate_dates(self) -> ProjectUpdate:
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date < self.start_date
        ):
            raise ValueError('end_date must be greater than or equal to start_date')
        return self

    @field_validator('project_status')
    @classmethod
    def validate_project_status(
        cls, value: ProjectStatus | None
    ) -> ProjectStatus | None:
        if value is None:
            raise ValueError('project_status cannot be null')
        return value


class ProjectRead(ProjectBase):
    id: int
    user_id: int
    template_id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class GeneratedProjectRead(BaseModel):
    project: ProjectRead
    budget_lines: list[BudgetLineRead]

    model_config = ConfigDict(from_attributes=True)
