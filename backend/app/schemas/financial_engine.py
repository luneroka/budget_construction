from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.budget_line import BudgetLineType
from app.models.transaction import InvoiceStatus, QuoteStatus, TransactionType


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
    remaining_budget_amount_ttc: Decimal
    selected_budget_variance_ttc: Decimal
    selected_quote_budget_variance_ttc: Decimal
    budget_completion_percentage: Decimal
    quote_count: int
    validated_quote_count: int
    diy_estimate_count: int
    invoice_count: int


class BudgetLineFinancialSummaryRead(FinancialTotalsRead):
    budget_line_id: int
    name: str
    item_type: BudgetLineType


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


class DashboardFinancialOverviewRead(BaseModel):
    project_id: int
    generated_at: datetime
    selected_budget_amount_ttc: Decimal
    actual_cost_amount_ttc: Decimal
    remaining_budget_amount_ttc: Decimal
    selected_budget_variance_ttc: Decimal
    budget_completion_percentage: Decimal


class DashboardSpendingOverTimePointRead(BaseModel):
    month: str
    actual_cost_amount_ttc: Decimal


class DashboardCategoryBudgetActualRead(BaseModel):
    category_id: int
    category_name: str
    selected_budget_amount_ttc: Decimal
    actual_cost_amount_ttc: Decimal


class DashboardCategoryDistributionRead(BaseModel):
    category_id: int
    category_name: str
    actual_cost_amount_ttc: Decimal


class DashboardSupplierDistributionRead(BaseModel):
    supplier_id: int | None
    supplier_name: str
    actual_cost_amount_ttc: Decimal


class DashboardTransactionWidgetItemRead(BaseModel):
    transaction_id: int
    budget_line_id: int
    transaction_type: TransactionType
    amount_ttc: Decimal
    issued_date: date
    due_date: date | None = None
    description: str | None = None
    quote_status: QuoteStatus | None = None
    invoice_status: InvoiceStatus | None = None
    supplier_name: str | None = None
    category_name: str
    product_name: str
    budget_line_name: str
    has_documents: bool


class DashboardTransactionWidgetRead(BaseModel):
    count: int
    items: list[DashboardTransactionWidgetItemRead]


class DashboardBudgetAlertRead(BaseModel):
    product_id: int
    product_name: str
    category_name: str
    selected_budget_amount_ttc: Decimal
    actual_cost_amount_ttc: Decimal
    variance_ttc: Decimal


class DashboardBudgetAlertsRead(BaseModel):
    count: int
    items: list[DashboardBudgetAlertRead]
