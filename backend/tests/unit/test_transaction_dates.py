from datetime import date

import pytest

from app.repositories.transaction import (
    TransactionValidationError,
    validate_transaction_dates,
)


def validating_dates(**values: object) -> dict[str, object]:
    validate_transaction_dates(values)
    return values


def test_requires_issued_date() -> None:
    with pytest.raises(
        TransactionValidationError,
        match='issued_date is required',
    ):
        validating_dates()


def test_accepts_issued_date_without_optional_dates() -> None:
    issued_date = date(2026, 6, 16)
    values = validating_dates(issued_date=issued_date)

    assert values['issued_date'] == issued_date


def test_accepts_due_date_equal_to_issued_date() -> None:
    issued_date = date(2026, 6, 16)
    values = validating_dates(issued_date=issued_date, due_date=issued_date)

    assert values['due_date'] == issued_date


def test_accepts_due_date_after_issued_date() -> None:
    issued_date = date(2026, 6, 16)
    due_date = date(2026, 6, 30)
    values = validating_dates(issued_date=issued_date, due_date=due_date)

    assert values['due_date'] == due_date


def test_rejects_due_date_before_issued_date() -> None:
    with pytest.raises(
        TransactionValidationError,
        match='due_date must be greater than or equal to issued_date',
    ):
        validating_dates(
            issued_date=date(2026, 6, 16),
            due_date=date(2026, 6, 15),
        )


def test_accepts_payment_date_equal_to_issued_date() -> None:
    issued_date = date(2026, 6, 16)
    values = validating_dates(issued_date=issued_date, payment_date=issued_date)

    assert values['payment_date'] == issued_date


def test_accepts_payment_date_after_issued_date() -> None:
    issued_date = date(2026, 6, 16)
    payment_date = date(2026, 6, 30)
    values = validating_dates(issued_date=issued_date, payment_date=payment_date)

    assert values['payment_date'] == payment_date


def test_rejects_payment_date_before_issued_date() -> None:
    with pytest.raises(
        TransactionValidationError,
        match='payment_date must be greater than or equal to issued_date',
    ):
        validating_dates(
            issued_date=date(2026, 6, 16),
            payment_date=date(2026, 6, 15),
        )
