from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class IssueReportCategory(StrEnum):
    bug = 'bug'
    feature_request = 'feature_request'
    improvement = 'improvement'
    question = 'question'


class IssueReportMetadata(BaseModel):
    route: str = Field(min_length=1, max_length=500)
    project_name: str | None = Field(default=None, max_length=255)
    user_agent: str = Field(min_length=1, max_length=1000)
    timestamp: datetime


class IssueReportResponse(BaseModel):
    message: str

    model_config = ConfigDict(from_attributes=True)
