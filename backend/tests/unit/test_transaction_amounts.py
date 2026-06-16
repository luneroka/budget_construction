from decimal import Decimal

import pytest

from app.repositories.transaction import (
    TransactionValidationError,
    normalize_transaction_amounts,
)


def normalizing_amounts(**values: object) -> dict[str, object]:
    normalize_transaction_amounts(values)
    return values


def test_calculates_vat_and_ttc_from_ht_and_vat_rate() -> None:
    values = normalizing_amounts(amount_ht='100.00', vat_rate='20.00')

    assert values['amount_ht'] == Decimal('100.00')
    assert values['vat_rate'] == Decimal('20.00')
    assert values['amount_vat'] == Decimal('20.00')
    assert values['amount_ttc'] == Decimal('120.00')


def test_calculates_vat_from_ht_and_ttc_when_rate_is_absent() -> None:
    values = normalizing_amounts(amount_ht='100.00', amount_ttc='119.60')

    assert values['amount_ht'] == Decimal('100.00')
    assert values['amount_vat'] == Decimal('19.60')
    assert values['amount_ttc'] == Decimal('119.60')


def test_rounds_calculated_vat_to_cents() -> None:
    values = normalizing_amounts(amount_ht='99.99', vat_rate='20.00')

    assert values['amount_vat'] == Decimal('20.00')
    assert values['amount_ttc'] == Decimal('119.99')


def test_accepts_consistent_explicit_vat_and_ttc() -> None:
    values = normalizing_amounts(
        amount_ht='100.00',
        amount_vat='20.00',
        amount_ttc='120.00',
    )

    assert values['amount_ht'] == Decimal('100.00')
    assert values['amount_vat'] == Decimal('20.00')
    assert values['amount_ttc'] == Decimal('120.00')


def test_rejects_vat_that_does_not_match_ht_and_rate() -> None:
    with pytest.raises(
        TransactionValidationError,
        match='amount_vat does not match amount_ht and vat_rate',
    ):
        normalizing_amounts(
            amount_ht='100.00',
            vat_rate='20.00',
            amount_vat='19.98',
        )


def test_rejects_ttc_that_does_not_match_ht_and_vat() -> None:
    with pytest.raises(
        TransactionValidationError,
        match='amount_ttc does not match amount_ht and amount_vat',
    ):
        normalizing_amounts(
            amount_ht='100.00',
            amount_vat='20.00',
            amount_ttc='119.98',
        )


@pytest.mark.parametrize(
    ('values', 'expected_message'),
    [
        (
            {'amount_ht': '-1.00', 'vat_rate': '20.00'},
            'amount_ht must be greater than or equal to 0',
        ),
        (
            {'amount_ht': '100.00', 'vat_rate': '-20.00'},
            'vat_rate must be greater than or equal to 0',
        ),
        (
            {'amount_ht': '100.00', 'amount_vat': '-1.00'},
            'amount_vat must be greater than or equal to 0',
        ),
        (
            {'amount_ht': '100.00', 'amount_ttc': '-1.00'},
            'amount_ttc must be greater than or equal to 0',
        ),
    ],
    ids=['amount_ht', 'vat_rate', 'amount_vat', 'amount_ttc'],
)
def test_rejects_negative_amount_inputs(
    values: dict[str, object],
    expected_message: str,
) -> None:
    with pytest.raises(TransactionValidationError, match=expected_message):
        normalizing_amounts(**values)


def test_rejects_missing_calculation_inputs() -> None:
    with pytest.raises(
        TransactionValidationError,
        match='amount_ttc is required when vat_rate and amount_vat are not provided',
    ):
        normalizing_amounts(amount_ht='100.00')
