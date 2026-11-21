from __future__ import annotations

import enum
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.lot import LOT_CODE_MAX_LENGTH, LOT_DESIGNATION_MAX_LENGTH


def _strip(value: Any) -> Any:
    return value.strip() if isinstance(value, str) else value


LotCode = Annotated[str, Field(min_length=1, max_length=LOT_CODE_MAX_LENGTH)]
LotDesignation = Annotated[
    str, Field(min_length=1, max_length=LOT_DESIGNATION_MAX_LENGTH)
]


class LotCreate(BaseModel):
    """A project-only lot. Its code and designation are fixed at creation."""

    code: LotCode
    designation: LotDesignation

    @field_validator('code', 'designation', mode='before')
    @classmethod
    def strip_text(cls, value: Any) -> Any:
        return _strip(value)


class LotVisibilityUpdate(BaseModel):
    is_hidden: bool


class GlobalLotUpdate(BaseModel):
    code: LotCode | None = None
    designation: LotDesignation | None = None

    @field_validator('code', 'designation', mode='before')
    @classmethod
    def strip_text(cls, value: Any) -> Any:
        return _strip(value)


class LotMoveDirection(str, enum.Enum):
    up = 'up'
    down = 'down'


class GlobalLotMove(BaseModel):
    direction: LotMoveDirection


class GlobalLotRead(BaseModel):
    id: int
    code: str
    designation: str
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class ProjectLotRead(BaseModel):
    """A lot as one project sees it: global or its own, visible or hidden."""

    id: int
    project_id: int | None
    code: str
    designation: str
    is_global: bool
    is_hidden: bool
    active_transaction_count: int


class SupplierLotCreate(BaseModel):
    supplier_id: int
    lot_id: int


class SupplierLotRead(BaseModel):
    project_id: int
    supplier_id: int
    lot_id: int

    model_config = ConfigDict(from_attributes=True)
