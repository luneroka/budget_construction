from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.budget_line import BudgetLineType


class FinancialTotalsRead(BaseModel):
    selected_budget_amount_ttc: Decimal
    selected_quote_budget_amount_ttc: Decimal
    selected_diy_budget_amount_ttc: Decimal
    quote_amount_ttc: Decimal
    validated_quote_amount_ttc: Decimal
    diy_estimate_amount_ttc: Decimal
    actual_cost_amount_ttc: Decimal
    paid_invoice_amount_ttc: Decimal
    unpaid_invoice_amount_ttc: Decimal
    on_hold_invoice_amount_ttc: Decimal
    selected_budget_variance_ttc: Decimal
    selected_quote_budget_variance_ttc: Decimal
    quote_count: int
    validated_quote_count: int
    diy_estimate_count: int
    invoice_count: int


class BudgetLineFinancialSummaryRead(FinancialTotalsRead):
    budget_line_id: int
    name: str
    item_type: BudgetLineType
    selected_budget_transaction_id: int | None = None


class ProductFinancialSummaryRead(FinancialTotalsRead):
    product_id: int
    product_name: str
    subcategory_name: str
    category_name: str
    budget_lines: list[BudgetLineFinancialSummaryRead]


class ProjectFinancialSummaryRead(FinancialTotalsRead):
    project_id: int
    generated_at: datetime
    products: list[ProductFinancialSummaryRead]
