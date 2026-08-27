"""Arithmetic identities of the financial engine's read model.

These used to be re-checked in the browser in development
(``frontend/src/lib/budgetWorkspaceVerification.ts``); the engine is the
single source of truth, so the invariants are asserted here instead.
"""

from datetime import date
from decimal import Decimal

from app.models.transaction import (
    InvoiceStatus,
    QuoteStatus,
    Transaction,
    TransactionType,
)
from app.services.financial_engine import (
    FinancialTotals,
    financial_totals_to_read_model,
)


def _transaction(
    transaction_type: TransactionType,
    amount: str,
    *,
    quote_status: QuoteStatus | None = None,
    invoice_status: InvoiceStatus | None = None,
    is_selected_budget: bool = False,
) -> Transaction:
    return Transaction(
        transaction_type=transaction_type,
        amount_ht=Decimal(amount),
        amount_ttc=Decimal(amount),
        issued_date=date(2026, 1, 1),
        quote_status=quote_status,
        invoice_status=invoice_status,
        is_selected_budget=is_selected_budget,
    )


def _sample_totals() -> FinancialTotals:
    totals = FinancialTotals()
    for transaction in (
        _transaction(
            TransactionType.quote,
            '1000.00',
            quote_status=QuoteStatus.validated,
            is_selected_budget=True,
        ),
        _transaction(
            TransactionType.quote, '400.00', quote_status=QuoteStatus.to_confirm
        ),
        _transaction(
            TransactionType.quote, '900.00', quote_status=QuoteStatus.rejected
        ),
        _transaction(
            TransactionType.diy_estimate, '250.00', is_selected_budget=True
        ),
        _transaction(
            TransactionType.invoice, '600.00', invoice_status=InvoiceStatus.paid
        ),
        _transaction(
            TransactionType.invoice, '150.00', invoice_status=InvoiceStatus.unpaid
        ),
        _transaction(
            TransactionType.invoice, '50.00', invoice_status=InvoiceStatus.on_hold
        ),
    ):
        totals.add_transaction(
            transaction, is_selected=transaction.is_selected_budget
        )
    return totals


def test_read_model_identities_hold() -> None:
    read_model = financial_totals_to_read_model(_sample_totals())

    assert read_model.selected_budget_amount_ttc == (
        read_model.selected_quote_budget_amount_ttc
        + read_model.selected_diy_budget_amount_ttc
    )
    assert read_model.selected_budget_variance_ttc == (
        read_model.selected_budget_amount_ttc - read_model.actual_cost_amount_ttc
    )
    assert read_model.remaining_budget_amount_ttc == (
        read_model.selected_budget_variance_ttc
    )
    assert read_model.selected_quote_budget_variance_ttc == (
        read_model.selected_quote_budget_amount_ttc
        - read_model.actual_cost_amount_ttc
    )
    assert read_model.actual_cost_amount_ttc == read_model.paid_invoice_amount_ttc
    assert read_model.budget_completion_percentage == Decimal('48.00')


def test_rejected_quotes_are_counted_but_not_summed() -> None:
    read_model = financial_totals_to_read_model(_sample_totals())

    assert read_model.quote_count == 3
    assert read_model.quote_amount_ttc == Decimal('1400.00')
    assert read_model.validated_quote_amount_ttc == Decimal('1000.00')


def test_merge_is_additive_over_every_field() -> None:
    """Product totals are the sum of their budget lines, and project totals the
    sum of their products -- merge() must add every money and count field."""
    left = _sample_totals()
    right = _sample_totals()
    merged = FinancialTotals()
    merged.merge(left)
    merged.merge(right)

    for field in vars(merged):
        assert getattr(merged, field) == getattr(left, field) + getattr(
            right, field
        ), field
