from datetime import date

import pytest

from app.models.transaction import (
    InvoiceStatus,
    InvoiceType,
    QuoteStatus,
    TransactionType,
)
from app.repositories.transaction import (
    TransactionValidationError,
    validate_selected_budget_candidate,
    validate_transaction_lifecycle,
)


def validate_lifecycle(**values: object) -> dict[str, object]:
    defaults: dict[str, object] = {'transaction_type': TransactionType.diy_estimate}
    defaults.update(values)
    validate_transaction_lifecycle(defaults)
    return defaults


def test_quote_requires_quote_status() -> None:
    with pytest.raises(
        TransactionValidationError,
        match='quote_status is required for quotes',
    ):
        validate_lifecycle(transaction_type=TransactionType.quote)


def test_quote_accepts_quote_status() -> None:
    values = validate_lifecycle(
        transaction_type=TransactionType.quote,
        quote_status=QuoteStatus.validated,
    )

    assert values['quote_status'] == QuoteStatus.validated


def test_diy_estimate_has_no_required_status_fields() -> None:
    values = validate_lifecycle(transaction_type=TransactionType.diy_estimate)

    assert values['transaction_type'] == TransactionType.diy_estimate


@pytest.mark.parametrize(
    ('values', 'expected_message'),
    [
        (
            {'invoice_type': InvoiceType.full},
            'invoice_status is required for invoices',
        ),
        (
            {'invoice_status': InvoiceStatus.unpaid},
            'invoice_type is required for invoices',
        ),
    ],
    ids=['missing_status', 'missing_type'],
)
def test_invoice_requires_status_and_type(
    values: dict[str, object],
    expected_message: str,
) -> None:
    with pytest.raises(TransactionValidationError, match=expected_message):
        validate_lifecycle(transaction_type=TransactionType.invoice, **values)


def test_paid_invoice_requires_payment_date() -> None:
    with pytest.raises(
        TransactionValidationError,
        match='payment_date is required for paid invoices',
    ):
        validate_lifecycle(
            transaction_type=TransactionType.invoice,
            invoice_status=InvoiceStatus.paid,
            invoice_type=InvoiceType.full,
        )


def test_paid_invoice_accepts_payment_date() -> None:
    payment_date = date(2026, 6, 16)
    values = validate_lifecycle(
        transaction_type=TransactionType.invoice,
        invoice_status=InvoiceStatus.paid,
        invoice_type=InvoiceType.full,
        payment_date=payment_date,
    )

    assert values['payment_date'] == payment_date


def test_unpaid_invoice_rejects_payment_date() -> None:
    with pytest.raises(
        TransactionValidationError,
        match='payment_date is only allowed when invoice_status is paid',
    ):
        validate_lifecycle(
            transaction_type=TransactionType.invoice,
            invoice_status=InvoiceStatus.unpaid,
            invoice_type=InvoiceType.full,
            payment_date=date(2026, 6, 16),
        )


@pytest.mark.parametrize(
    'quote_status',
    [
        QuoteStatus.to_confirm,
        QuoteStatus.to_negotiate,
        QuoteStatus.validated,
        QuoteStatus.rejected,
    ],
)
def test_quote_accepts_all_quote_statuses(quote_status: QuoteStatus) -> None:
    values = validate_lifecycle(
        transaction_type=TransactionType.quote,
        quote_status=quote_status,
    )

    assert values['quote_status'] == quote_status


def test_selected_budget_candidate_accepts_validated_quote() -> None:
    validate_selected_budget_candidate(
        TransactionType.quote,
        QuoteStatus.validated,
    )


def test_selected_budget_candidate_accepts_diy_estimate() -> None:
    validate_selected_budget_candidate(
        TransactionType.diy_estimate,
        None,
    )


@pytest.mark.parametrize(
    'quote_status',
    [QuoteStatus.to_confirm, QuoteStatus.to_negotiate, QuoteStatus.rejected],
)
def test_selected_budget_candidate_rejects_unvalidated_quote(
    quote_status: QuoteStatus,
) -> None:
    with pytest.raises(
        TransactionValidationError,
        match='Only validated quotes can be selected as budget candidates',
    ):
        validate_selected_budget_candidate(
            TransactionType.quote,
            quote_status,
        )


def test_selected_budget_candidate_rejects_invoice() -> None:
    with pytest.raises(
        TransactionValidationError,
        match='Only quotes and DIY estimates can be selected as budget candidates',
    ):
        validate_selected_budget_candidate(
            TransactionType.invoice,
            None,
        )
