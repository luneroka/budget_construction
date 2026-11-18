from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.transaction import InvoiceStatus, QuoteStatus, TransactionType


class FinancialTotalsRead(BaseModel):
    # « Devis retenus »: TTC of the active validated quotes.
    validated_quote_amount_ttc: Decimal
    # « Facturé »: TTC of every active invoice, whatever its payment status.
    invoiced_amount_ttc: Decimal
    paid_invoice_amount_ttc: Decimal
    unpaid_invoice_amount_ttc: Decimal
    on_hold_invoice_amount_ttc: Decimal
    # « Reste à facturer » = Devis retenus - Facturé; negative is an overrun.
    remaining_to_invoice_ttc: Decimal
    is_overrun: bool
    completion_percentage: Decimal
    quote_count: int
    validated_quote_count: int
    invoice_count: int


class LotFinancialSummaryRead(FinancialTotalsRead):
    lot_id: int
    project_id: int | None
    code: str
    designation: str
    is_global: bool


class ProjectFinancialSummaryRead(FinancialTotalsRead):
    project_id: int
    generated_at: datetime
    lots: list[LotFinancialSummaryRead]


class DashboardFinancialOverviewRead(BaseModel):
    project_id: int
    generated_at: datetime
    validated_quote_amount_ttc: Decimal
    invoiced_amount_ttc: Decimal
    remaining_to_invoice_ttc: Decimal
    completion_percentage: Decimal


class DashboardSpendingOverTimePointRead(BaseModel):
    month: str
    invoiced_amount_ttc: Decimal


class DashboardLotBudgetInvoicedRead(BaseModel):
    lot_id: int
    lot_code: str
    lot_designation: str
    validated_quote_amount_ttc: Decimal
    invoiced_amount_ttc: Decimal


class DashboardLotDistributionRead(BaseModel):
    lot_id: int
    lot_code: str
    lot_designation: str
    invoiced_amount_ttc: Decimal


class DashboardSupplierDistributionRead(BaseModel):
    supplier_id: int | None
    supplier_name: str
    invoiced_amount_ttc: Decimal


class DashboardTransactionWidgetItemRead(BaseModel):
    transaction_id: int
    lot_id: int
    lot_code: str
    lot_designation: str
    transaction_type: TransactionType
    title: str | None = None
    reference: str | None = None
    amount_ttc: Decimal
    issued_date: date
    due_date: date | None = None
    description: str | None = None
    quote_status: QuoteStatus | None = None
    invoice_status: InvoiceStatus | None = None
    supplier_name: str | None = None
    has_documents: bool


class DashboardTransactionWidgetRead(BaseModel):
    count: int
    items: list[DashboardTransactionWidgetItemRead]


class DashboardBudgetAlertRead(BaseModel):
    lot_id: int
    lot_code: str
    lot_designation: str
    validated_quote_amount_ttc: Decimal
    invoiced_amount_ttc: Decimal
    variance_ttc: Decimal


class DashboardBudgetAlertsRead(BaseModel):
    count: int
    items: list[DashboardBudgetAlertRead]
