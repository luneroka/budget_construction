from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.supplier_document import SupplierDocumentType
from app.models.transaction import InvoiceStatus, QuoteStatus, TransactionType


class FinancialTotalsRead(BaseModel):
    # « Coût prévu »: per supplier and per lot, the larger of its validated
    # quotes and its invoices; a lot, a supplier or the project adds them up.
    planned_cost_ttc: Decimal
    # « Devis validés »: TTC of the active validated quotes, for reference.
    validated_quote_amount_ttc: Decimal
    # « Facturé »: TTC of every active invoice, whatever its payment status.
    invoiced_amount_ttc: Decimal
    # « Payé »
    paid_invoice_amount_ttc: Decimal
    unpaid_invoice_amount_ttc: Decimal
    on_hold_invoice_amount_ttc: Decimal
    # « À payer » = unpaid + on hold, so Payé + À payer = Facturé.
    to_pay_amount_ttc: Decimal
    quote_count: int
    validated_quote_count: int
    invoice_count: int


class LotSupplierFinancialSummaryRead(FinancialTotalsRead):
    """One supplier's group in one lot; ``supplier_id`` None is « Sans
    fournisseur ». Only groups with active transactions are listed."""

    supplier_id: int | None


class LotFinancialSummaryRead(FinancialTotalsRead):
    lot_id: int
    project_id: int | None
    code: str
    designation: str
    is_global: bool
    suppliers: list[LotSupplierFinancialSummaryRead]


class SupplierFinancialSummaryRead(FinancialTotalsRead):
    """A supplier over the project's visible lots: the sum of its lot groups,
    so its Coût prévu is the sum of its per-lot maxes."""

    supplier_id: int


class ProjectFinancialSummaryRead(FinancialTotalsRead):
    project_id: int
    generated_at: datetime
    lots: list[LotFinancialSummaryRead]
    suppliers: list[SupplierFinancialSummaryRead]


class DashboardFinancialOverviewRead(BaseModel):
    project_id: int
    generated_at: datetime
    planned_cost_ttc: Decimal
    invoiced_amount_ttc: Decimal
    paid_invoice_amount_ttc: Decimal
    to_pay_amount_ttc: Decimal


class DashboardSpendingOverTimePointRead(BaseModel):
    month: str
    invoiced_amount_ttc: Decimal


class DashboardLotInvoicedRead(BaseModel):
    lot_id: int
    lot_code: str
    lot_designation: str
    invoiced_amount_ttc: Decimal
    paid_invoice_amount_ttc: Decimal
    to_pay_amount_ttc: Decimal


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


class DashboardSupplierDocumentRead(BaseModel):
    """A dated document of a supplier assigned to one of the project's visible
    lots. Whether it is expired or expiring soon is the frontend's call, on
    the user's own date."""

    id: int
    supplier_id: int
    supplier_name: str
    type: SupplierDocumentType
    expiry_date: date
    original_filename: str
