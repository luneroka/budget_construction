from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from io import StringIO
from collections.abc import Mapping
from typing import TypeVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.models.transaction import (
    InvoiceStatus,
    InvoiceType,
    PaymentMethod,
    QuoteStatus,
    Transaction,
    TransactionType,
)
from app.services.financial_engine import (
    ProjectFinancials,
    financial_engine,
    iter_project_transactions,
)

EnumValue = TypeVar('EnumValue', bound=Enum)


class ExportTransactionType(str, Enum):
    all = 'all'
    invoices = 'invoices'
    quotes = 'quotes'
    diy_estimates = 'diy_estimates'


CSV_COLUMNS = [
    'Transaction ID',
    'Transaction type',
    'Supplier',
    'Project',
    'Category',
    'Subcategory',
    'Product',
    'Budget line',
    'Amount HT',
    'VAT rate (%)',
    'VAT amount',
    'Amount TTC',
    'Issued date',
    'Due date',
    'Payment date',
    'Quote status',
    'Invoice status',
    'Invoice type',
    'Payment method',
    'Description',
    'Supplier reference',
    'Document present',
    'Document filename(s)',
    'Original document filename(s)',
    'Created at',
    'Updated at',
]

TRANSACTION_TYPE_LABELS = {
    TransactionType.invoice: 'Invoice',
    TransactionType.quote: 'Quote',
    TransactionType.diy_estimate: 'DIY Estimate',
}

QUOTE_STATUS_LABELS = {
    QuoteStatus.to_confirm: 'To confirm',
    QuoteStatus.to_negotiate: 'To negotiate',
    QuoteStatus.validated: 'Validated',
}

INVOICE_STATUS_LABELS = {
    InvoiceStatus.unpaid: 'Unpaid',
    InvoiceStatus.on_hold: 'On hold',
    InvoiceStatus.paid: 'Paid',
}

INVOICE_TYPE_LABELS = {
    InvoiceType.full: 'Full',
    InvoiceType.deposit: 'Deposit',
    InvoiceType.interim: 'Interim',
    InvoiceType.balance: 'Balance',
}

PAYMENT_METHOD_LABELS = {
    PaymentMethod.cash: 'Cash',
    PaymentMethod.card: 'Card',
    PaymentMethod.wire: 'Wire transfer',
}


@dataclass(frozen=True)
class AccountingExportFilters:
    start_date: date | None = None
    end_date: date | None = None
    transaction_type: ExportTransactionType = ExportTransactionType.all


@dataclass(frozen=True)
class AccountingExportResult:
    project_name: str
    csv_content: str


def _format_decimal(value: Decimal | None) -> str:
    if value is None:
        return ''

    return f'{value:.2f}'


def _format_date(value: date | None) -> str:
    return value.isoformat() if value is not None else ''


def _format_datetime(value: datetime | None) -> str:
    return value.isoformat(sep=' ', timespec='seconds') if value is not None else ''


def _format_enum_label(
    value: EnumValue | None,
    labels: Mapping[EnumValue, str],
) -> str:
    if value is None:
        return ''

    return labels[value]


def _supplier_name(supplier: Supplier | None) -> str:
    if supplier is None or supplier.deleted_at is not None:
        return ''

    return supplier.name


def _supplier_reference(supplier: Supplier | None) -> str:
    if supplier is None or supplier.deleted_at is not None:
        return ''

    return supplier.siret or ''


def _matches_filters(
    transaction: Transaction,
    filters: AccountingExportFilters,
) -> bool:
    if filters.start_date is not None and transaction.issued_date < filters.start_date:
        return False

    if filters.end_date is not None and transaction.issued_date > filters.end_date:
        return False

    if filters.transaction_type == ExportTransactionType.all:
        return True

    return {
        ExportTransactionType.invoices: TransactionType.invoice,
        ExportTransactionType.quotes: TransactionType.quote,
        ExportTransactionType.diy_estimates: TransactionType.diy_estimate,
    }[filters.transaction_type] == transaction.transaction_type


def build_accounting_export_rows(
    project_financials: ProjectFinancials,
    filters: AccountingExportFilters,
) -> list[dict[str, str]]:
    transactions = [
        transaction
        for transaction in iter_project_transactions(project_financials)
        if _matches_filters(transaction, filters)
    ]
    transactions.sort(key=lambda transaction: (transaction.issued_date, transaction.id))

    rows: list[dict[str, str]] = []
    for transaction in transactions:
        budget_line = transaction.budget_line
        product = budget_line.product
        subcategory = product.subcategory
        category = subcategory.category
        active_documents = [
            document
            for document in transaction.documents
            if document.deleted_at is None
        ]

        rows.append(
            {
                'Transaction ID': str(transaction.id),
                'Transaction type': TRANSACTION_TYPE_LABELS[
                    transaction.transaction_type
                ],
                'Supplier': _supplier_name(transaction.supplier),
                'Project': project_financials.project_name,
                'Category': category.name,
                'Subcategory': subcategory.name,
                'Product': product.name,
                'Budget line': budget_line.name,
                'Amount HT': _format_decimal(transaction.amount_ht),
                'VAT rate (%)': _format_decimal(transaction.vat_rate),
                'VAT amount': _format_decimal(transaction.amount_vat),
                'Amount TTC': _format_decimal(transaction.amount_ttc),
                'Issued date': _format_date(transaction.issued_date),
                'Due date': _format_date(transaction.due_date),
                'Payment date': _format_date(transaction.payment_date),
                'Quote status': _format_enum_label(
                    transaction.quote_status,
                    QUOTE_STATUS_LABELS,
                ),
                'Invoice status': _format_enum_label(
                    transaction.invoice_status,
                    INVOICE_STATUS_LABELS,
                ),
                'Invoice type': _format_enum_label(
                    transaction.invoice_type,
                    INVOICE_TYPE_LABELS,
                ),
                'Payment method': _format_enum_label(
                    transaction.payment_method,
                    PAYMENT_METHOD_LABELS,
                ),
                'Description': transaction.description or '',
                'Supplier reference': _supplier_reference(transaction.supplier),
                'Document present': 'Yes' if active_documents else 'No',
                'Document filename(s)': '; '.join(
                    document.stored_filename for document in active_documents
                ),
                'Original document filename(s)': '; '.join(
                    document.original_filename for document in active_documents
                ),
                'Created at': _format_datetime(transaction.created_at),
                'Updated at': _format_datetime(transaction.updated_at),
            }
        )

    return rows


def render_accounting_csv(rows: list[dict[str, str]]) -> str:
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_COLUMNS, lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
    return '\ufeff' + output.getvalue()


async def generate_accounting_csv(
    db: AsyncSession,
    project_id: int,
    user_id: int,
    filters: AccountingExportFilters,
) -> AccountingExportResult | None:
    project_financials = await financial_engine.calculate_project_financials(
        db,
        project_id,
        user_id,
    )
    if project_financials is None:
        return None

    rows = build_accounting_export_rows(project_financials, filters)
    return AccountingExportResult(
        project_name=project_financials.project_name,
        csv_content=render_accounting_csv(rows),
    )
