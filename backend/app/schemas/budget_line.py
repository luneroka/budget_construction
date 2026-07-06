from __future__ import annotations

from datetime import datetime
import enum

from pydantic import BaseModel, ConfigDict, Field

from app.models.budget_line import BudgetLineType
from app.schemas.product import ProductWithHierarchy


class ProductLineConversionStrategy(str, enum.Enum):
    archive_existing = 'archive_existing'
    reuse_existing_as_breakdown = 'reuse_existing_as_breakdown'


class BudgetLineCreate(BaseModel):
    product_id: int
    name: str
    item_type: BudgetLineType
    sort_order: int = 0


class BudgetLineUpdate(BaseModel):
    name: str | None = None
    item_type: BudgetLineType | None = None
    sort_order: int | None = None


class ProductLineConvertToBreakdown(BaseModel):
    strategy: ProductLineConversionStrategy | None = None
    existing_line_new_name: str | None = None
    new_breakdown_names: list[str] = Field(default_factory=list)


class BudgetLineRead(BaseModel):
    id: int
    project_id: int
    template_item_id: int | None = None
    product_id: int
    selected_quote_transaction_id: int | None = None
    selected_diy_estimate_transaction_id: int | None = None
    name: str
    item_type: BudgetLineType
    sort_order: int
    product: ProductWithHierarchy
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
