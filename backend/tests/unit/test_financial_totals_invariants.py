"""Arithmetic of the financial engine's totals (money-model spec criteria 1
and 5).

Per supplier group in a lot: Coût prévu = max(TTC of its active validated
quotes, TTC of its active invoices). Facturé = every active invoice, split
Payé / À payer (unpaid + on hold). A lot, a supplier or the project adds up
its groups, so their Coût prévu is a sum of maxes.
"""

from datetime import date
from decimal import Decimal

import pytest

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
) -> Transaction:
    return Transaction(
        transaction_type=transaction_type,
        amount_ht=Decimal(amount),
        amount_ttc=Decimal(amount),
        issued_date=date(2026, 1, 1),
        quote_status=quote_status,
        invoice_status=invoice_status,
    )


def _quote(amount: str, status: QuoteStatus = QuoteStatus.validated) -> Transaction:
    return _transaction(TransactionType.quote, amount, quote_status=status)


def _invoice(
    amount: str, status: InvoiceStatus = InvoiceStatus.unpaid
) -> Transaction:
    return _transaction(TransactionType.invoice, amount, invoice_status=status)


def _group(*transactions: Transaction) -> FinancialTotals:
    totals = FinancialTotals()
    for transaction in transactions:
        totals.add_transaction(transaction)
    return totals


def _sum(*groups: FinancialTotals) -> FinancialTotals:
    totals = FinancialTotals()
    for group in groups:
        totals.merge(group)
    return totals


def _sample_group() -> FinancialTotals:
    return _group(
        _quote('1000.00'),
        _quote('400.00', QuoteStatus.to_confirm),
        _quote('300.00', QuoteStatus.to_negotiate),
        _quote('900.00', QuoteStatus.rejected),
        _invoice('600.00', InvoiceStatus.paid),
        _invoice('150.00', InvoiceStatus.unpaid),
        _invoice('50.00', InvoiceStatus.on_hold),
    )


def test_quotes_only_plan_the_validated_quotes() -> None:
    totals = _group(_quote('500.00'), _quote('250.00'))

    assert totals.planned_cost_ttc == Decimal('750.00')
    assert totals.invoiced_amount_ttc == Decimal('0.00')


def test_invoices_only_plan_the_invoices() -> None:
    totals = _group(_invoice('80.00'), _invoice('20.00', InvoiceStatus.paid))

    assert totals.planned_cost_ttc == totals.invoiced_amount_ttc == Decimal('100.00')


def test_a_larger_quote_is_the_plan() -> None:
    totals = _group(_quote('1000.00'), _invoice('300.00'))

    assert totals.planned_cost_ttc == Decimal('1000.00')


def test_larger_invoices_are_the_plan() -> None:
    totals = _group(_quote('200.00'), _invoice('260.00', InvoiceStatus.paid))

    assert totals.planned_cost_ttc == Decimal('260.00')


@pytest.mark.parametrize(
    'quote_status',
    [QuoteStatus.to_confirm, QuoteStatus.to_negotiate, QuoteStatus.rejected],
)
def test_only_validated_quotes_plan_anything(quote_status: QuoteStatus) -> None:
    totals = _group(_quote('100.00', quote_status))

    assert totals.planned_cost_ttc == Decimal('0.00')
    assert totals.validated_quote_amount_ttc == Decimal('0.00')
    assert totals.quote_count == 1


@pytest.mark.parametrize(
    ('invoice_status', 'bucket'),
    [
        (InvoiceStatus.paid, 'paid_invoice_amount_ttc'),
        (InvoiceStatus.unpaid, 'unpaid_invoice_amount_ttc'),
        (InvoiceStatus.on_hold, 'on_hold_invoice_amount_ttc'),
    ],
)
def test_every_invoice_status_counts_as_invoiced(
    invoice_status: InvoiceStatus, bucket: str
) -> None:
    totals = _group(_invoice('80.00', invoice_status))

    assert totals.invoiced_amount_ttc == Decimal('80.00')
    assert getattr(totals, bucket) == Decimal('80.00')
    assert totals.to_pay_amount_ttc == (
        Decimal('0.00') if invoice_status == InvoiceStatus.paid else Decimal('80.00')
    )


def test_two_suppliers_each_take_their_own_max() -> None:
    quoted = _group(_quote('1000.00'), _invoice('650.00'))
    over_invoiced = _group(_quote('200.00'), _invoice('260.00'))

    lot = _sum(quoted, over_invoiced)

    # Not max(1200, 910): each supplier keeps its own max.
    assert lot.planned_cost_ttc == Decimal('1260.00')
    assert lot.validated_quote_amount_ttc == Decimal('1200.00')
    assert lot.invoiced_amount_ttc == Decimal('910.00')


def test_read_model_identities_hold() -> None:
    read_model = financial_totals_to_read_model(_sample_group())

    assert read_model.planned_cost_ttc == Decimal('1000.00')
    assert read_model.validated_quote_amount_ttc == Decimal('1000.00')
    assert read_model.invoiced_amount_ttc == Decimal('800.00')
    assert read_model.paid_invoice_amount_ttc == Decimal('600.00')
    assert read_model.to_pay_amount_ttc == Decimal('200.00')
    assert read_model.invoiced_amount_ttc == (
        read_model.paid_invoice_amount_ttc + read_model.to_pay_amount_ttc
    )
    assert read_model.to_pay_amount_ttc == (
        read_model.unpaid_invoice_amount_ttc + read_model.on_hold_invoice_amount_ttc
    )
    assert read_model.quote_count == 4
    assert read_model.validated_quote_count == 1
    assert read_model.invoice_count == 3


def test_removed_figures_are_gone_from_the_read_model() -> None:
    fields = set(financial_totals_to_read_model(FinancialTotals()).model_dump())

    assert fields.isdisjoint(
        {'remaining_to_invoice_ttc', 'is_overrun', 'completion_percentage'}
    )


def test_empty_lot_is_all_zero() -> None:
    read_model = financial_totals_to_read_model(FinancialTotals())

    for value in read_model.model_dump().values():
        assert value == 0


def test_merge_is_additive_over_every_field() -> None:
    """A lot is the sum of its groups, the project the sum of its lots --
    merge() must add every money and count field, Coût prévu included."""
    left = _sample_group()
    right = _group(_invoice('90.00'))
    merged = _sum(left, right)

    for field in vars(merged):
        assert getattr(merged, field) == getattr(left, field) + getattr(
            right, field
        ), field
