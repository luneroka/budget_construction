import pytest
from pydantic import ValidationError

from app.schemas.supplier import SupplierContactCreate, SupplierCreate, SupplierUpdate


def primary_contact() -> SupplierContactCreate:
    return SupplierContactCreate(name='Primary Contact', is_primary=True)


def test_supplier_create_accepts_null_empty_and_valid_address_fields() -> None:
    empty = SupplierCreate(name='Supplier', contacts=[primary_contact()])
    assert empty.street is None
    assert empty.complement is None
    assert empty.postal_code is None
    assert empty.city is None

    blank = SupplierCreate(
        name='Supplier',
        street='  ',
        complement='  ',
        postal_code='  ',
        city='  ',
        contacts=[primary_contact()],
    )
    assert blank.street is None
    assert blank.complement is None
    assert blank.postal_code is None
    assert blank.city is None

    filled = SupplierCreate(
        name='Supplier',
        street='  12 Rue des Lilas  ',
        complement='  Bâtiment B  ',
        postal_code=' 75012 ',
        city='  Paris  ',
        contacts=[primary_contact()],
    )
    assert filled.street == '12 Rue des Lilas'
    assert filled.complement == 'Bâtiment B'
    assert filled.postal_code == '75012'
    assert filled.city == 'Paris'


@pytest.mark.parametrize(
    'postal_code',
    ['7501', '750123', '7501A', 'ABCDE', '750 12'],
)
def test_supplier_create_rejects_invalid_postal_code(postal_code: str) -> None:
    with pytest.raises(ValidationError):
        SupplierCreate(
            name='Supplier',
            postal_code=postal_code,
            contacts=[primary_contact()],
        )


def test_supplier_update_validates_address_fields() -> None:
    update = SupplierUpdate(
        street=' 12 Rue des Lilas ',
        complement='',
        postal_code='75012',
        city=' Paris ',
    )
    assert update.street == '12 Rue des Lilas'
    assert update.complement is None
    assert update.postal_code == '75012'
    assert update.city == 'Paris'

    with pytest.raises(ValidationError):
        SupplierUpdate(postal_code='invalid')
