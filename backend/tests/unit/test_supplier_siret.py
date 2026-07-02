import pytest
from pydantic import ValidationError

from app.schemas.supplier import SupplierCreate, SupplierUpdate


def test_supplier_create_accepts_null_empty_and_valid_siret() -> None:
    assert SupplierCreate(name='Supplier', siret=None).siret is None
    assert SupplierCreate(name='Supplier', siret='').siret is None
    assert SupplierCreate(name='Supplier', siret='  ').siret is None
    assert SupplierCreate(name='Supplier', siret='12345678901234').siret == (
        '12345678901234'
    )


@pytest.mark.parametrize(
    'siret',
    ['1234567890123', '123456789012345', '1234567890123A'],
)
def test_supplier_create_rejects_invalid_siret(siret: str) -> None:
    with pytest.raises(ValidationError):
        SupplierCreate(name='Supplier', siret=siret)


def test_supplier_update_validates_siret() -> None:
    assert SupplierUpdate(siret='').siret is None
    assert SupplierUpdate(siret='12345678901234').siret == '12345678901234'

    with pytest.raises(ValidationError):
        SupplierUpdate(siret='invalid')
