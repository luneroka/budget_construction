"""Arithmetic of the financial engine's lot totals (spec criterion 17).

Per lot: Devis retenus = TTC of the active validated quotes; Facturé = TTC
of every active invoice, split paid / unpaid / on hold; Reste à facturer =
Devis retenus - Facturé, negative when the lot is in overrun.
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


def _totals(*transactions: Transaction) -> FinancialTotals:
    totals = FinancialTotals()
    for transaction in transactions:
        totals.add_transaction(transaction)
    return totals


def _sample_totals() -> FinancialTotals:
    return _totals(
        _transaction(
            TransactionType.quote, '1000.00', quote_status=QuoteStatus.validated
        ),
        _transaction(
            TransactionType.quote, '400.00', quote_status=QuoteStatus.to_confirm
        ),
        _transaction(
            TransactionType.quote, '300.00', quote_status=QuoteStatus.to_negotiate
        ),
        _transaction(
            TransactionType.quote, '900.00', quote_status=QuoteStatus.rejected
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
    )


@pytest.mark.parametrize(
    ('quote_status', 'counts'),
    [
        (QuoteStatus.validated, True),
        (QuoteStatus.to_confirm, False),
        (QuoteStatus.to_negotiate, False),
        (QuoteStatus.rejected, False),
    ],
)
def test_only_validated_quotes_are_retained(
    quote_status: QuoteStatus, counts: bool
) -> None:
    totals = _totals(
        _transaction(TransactionType.quote, '100.00', quote_status=quote_status)
    )

    assert totals.validated_quote_amount_ttc == (
        Decimal('100.00') if counts else Decimal('0.00')
    )
    assert totals.invoiced_amount_ttc == Decimal('0.00')
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
    totals = _totals(
        _transaction(TransactionType.invoice, '80.00', invoice_status=invoice_status)
    )

    assert totals.invoiced_amount_ttc == Decimal('80.00')
    assert getattr(totals, bucket) == Decimal('80.00')
    assert totals.validated_quote_amount_ttc == Decimal('0.00')


def test_read_model_identities_hold() -> None:
    read_model = financial_totals_to_read_model(_sample_totals())

    assert read_model.validated_quote_amount_ttc == Decimal('1000.00')
    assert read_model.invoiced_amount_ttc == Decimal('800.00')
    assert read_model.invoiced_amount_ttc == (
        read_model.paid_invoice_amount_ttc
        + read_model.unpaid_invoice_amount_ttc
        + read_model.on_hold_invoice_amount_ttc
    )
    assert read_model.remaining_to_invoice_ttc == Decimal('200.00')
    assert read_model.is_overrun is False
    assert read_model.completion_percentage == Decimal('80.00')
    assert read_model.quote_count == 4
    assert read_model.validated_quote_count == 1
    assert read_model.invoice_count == 3


def test_negative_remainder_is_an_overrun() -> None:
    read_model = financial_totals_to_read_model(
        _totals(
            _transaction(
                TransactionType.quote, '100.00', quote_status=QuoteStatus.validated
            ),
            _transaction(
                TransactionType.invoice, '130.00', invoice_status=InvoiceStatus.unpaid
            ),
        )
    )

    assert read_model.remaining_to_invoice_ttc == Decimal('-30.00')
    assert read_model.is_overrun is True


def test_empty_lot_is_all_zero() -> None:
    read_model = financial_totals_to_read_model(FinancialTotals())

    assert read_model.validated_quote_amount_ttc == Decimal('0.00')
    assert read_model.invoiced_amount_ttc == Decimal('0.00')
    assert read_model.remaining_to_invoice_ttc == Decimal('0.00')
    assert read_model.is_overrun is False
    assert read_model.completion_percentage == Decimal('0.00')


def test_merge_is_additive_over_every_field() -> None:
    """Project totals are the sum of their lots -- merge() must add every
    money and count field."""
    left = _sample_totals()
    right = _sample_totals()
    merged = FinancialTotals()
    merged.merge(left)
    merged.merge(right)

    for field in vars(merged):
        assert getattr(merged, field) == getattr(left, field) + getattr(
            right, field
        ), field
