from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.budget_line import BudgetLineType
from app.schemas.product import ProductWithHierarchy


class BudgetLineCreate(BaseModel):
    product_id: int
    name: str
    item_type: BudgetLineType
    sort_order: int = 0


class BudgetLineUpdate(BaseModel):
    name: str | None = None
    item_type: BudgetLineType | None = None
    sort_order: int | None = None


class BudgetLineRead(BaseModel):
    id: int
    project_id: int
    template_item_id: int | None = None
    product_id: int
    selected_budget_transaction_id: int | None = None
    name: str
    item_type: BudgetLineType
    sort_order: int
    product: ProductWithHierarchy
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
