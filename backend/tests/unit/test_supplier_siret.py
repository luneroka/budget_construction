import pytest
from pydantic import ValidationError

from app.schemas.supplier import (
    SupplierContactCreate,
    SupplierContactUpdate,
    SupplierCreate,
    SupplierUpdate,
)


def primary_contact() -> SupplierContactCreate:
    return SupplierContactCreate(name='Primary Contact', is_primary=True)


def test_supplier_create_accepts_null_empty_valid_siren_and_valid_siret() -> None:
    assert (
        SupplierCreate(name='Supplier', siret=None, contacts=[primary_contact()]).siret
        is None
    )
    assert (
        SupplierCreate(name='Supplier', siret='', contacts=[primary_contact()]).siret
        is None
    )
    assert (
        SupplierCreate(name='Supplier', siret='  ', contacts=[primary_contact()]).siret
        is None
    )
    assert (
        SupplierCreate(
            name='Supplier',
            siret='12345678901234',
            contacts=[primary_contact()],
        ).siret
        == '12345678901234'
    )
    assert (
        SupplierCreate(
            name='Supplier',
            siret='123456789',
            contacts=[primary_contact()],
        ).siret
        == '123456789'
    )
    assert (
        SupplierCreate(
            name='Supplier',
            siret='123 456 789 01234',
            contacts=[primary_contact()],
        ).siret
        == '12345678901234'
    )
    assert (
        SupplierCreate(
            name='Supplier',
            siret=' 123 456 789 ',
            contacts=[primary_contact()],
        ).siret
        == '123456789'
    )


@pytest.mark.parametrize(
    'siret',
    ['12345678', '1234567890', '1234567890123', '123456789012345', '12345678A'],
)
def test_supplier_create_rejects_invalid_siret(siret: str) -> None:
    with pytest.raises(ValidationError):
        SupplierCreate(name='Supplier', siret=siret, contacts=[primary_contact()])


def test_supplier_update_validates_siret() -> None:
    assert SupplierUpdate(siret='').siret is None
    assert SupplierUpdate(siret='12345678901234').siret == '12345678901234'
    assert SupplierUpdate(siret='123456789').siret == '123456789'
    assert SupplierUpdate(siret='123 456 789 01234').siret == '12345678901234'

    with pytest.raises(ValidationError):
        SupplierUpdate(siret='invalid')


def test_supplier_create_requires_one_primary_contact() -> None:
    with pytest.raises(ValidationError):
        SupplierCreate(
            name='Supplier',
            contacts=[
                SupplierContactCreate(name='First Contact', is_primary=False),
                SupplierContactCreate(name='Second Contact', is_primary=False),
            ],
        )

    with pytest.raises(ValidationError):
        SupplierCreate(
            name='Supplier',
            contacts=[
                SupplierContactCreate(name='First Contact', is_primary=True),
                SupplierContactCreate(name='Second Contact', is_primary=True),
            ],
        )


def test_supplier_update_validates_primary_contact_when_contacts_are_supplied() -> None:
    assert SupplierUpdate(name='Supplier').contacts is None

    with pytest.raises(ValidationError):
        SupplierUpdate(
            contacts=[
                SupplierContactUpdate(name='First Contact', is_primary=False),
                SupplierContactUpdate(name='Second Contact', is_primary=False),
            ],
        )


def test_supplier_create_marks_single_contact_as_primary() -> None:
    supplier = SupplierCreate(
        name='Supplier',
        contacts=[SupplierContactCreate(name='Only Contact', is_primary=False)],
    )

    assert supplier.contacts[0].is_primary is True


def test_supplier_update_marks_single_contact_as_primary() -> None:
    supplier = SupplierUpdate(
        contacts=[SupplierContactUpdate(name='Only Contact', is_primary=False)],
    )

    assert supplier.contacts is not None
    assert supplier.contacts[0].is_primary is True


def test_supplier_contact_rejects_empty_contact() -> None:
    with pytest.raises(ValidationError):
        SupplierCreate(
            name='Supplier',
            contacts=[
                SupplierContactCreate(
                    name='  ',
                    phone_number=' ',
                    is_primary=True,
                )
            ],
        )
