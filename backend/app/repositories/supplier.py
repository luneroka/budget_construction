from datetime import datetime, UTC
from typing import Sequence, cast

from sqlalchemy import select, update
from sqlalchemy.sql import Select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.supplier import Supplier
from app.models.supplier_contact import SupplierContact
from app.models.supplier_document import SupplierDocument
from app.schemas.supplier import (
    SupplierContactCreate,
    SupplierContactUpdate,
    SupplierCreate,
    SupplierUpdate,
)

SupplierContactWrite = SupplierContactCreate | SupplierContactUpdate


def _supplier_query() -> Select[tuple[Supplier]]:
    return select(Supplier).options(selectinload(Supplier.contacts))


def _contact_values(contact_data: SupplierContactWrite) -> dict[str, object]:
    return cast(dict[str, object], contact_data.model_dump(exclude={'id'}))


async def _replace_supplier_contacts(
    db: AsyncSession,
    supplier: Supplier,
    contacts_data: Sequence[SupplierContactWrite],
) -> None:
    for contact in supplier.contacts:
        contact.is_primary = False
    await db.flush()

    supplier.contacts.clear()
    await db.flush()

    supplier.contacts.extend(
        SupplierContact(**_contact_values(contact_data))
        for contact_data in contacts_data
    )


async def create_supplier(
    db: AsyncSession, supplier_data: SupplierCreate, user_id: int
) -> Supplier:
    payload = supplier_data.model_dump(exclude={'contacts'})
    supplier = Supplier(**payload, user_id=user_id)
    supplier.contacts.extend(
        SupplierContact(**_contact_values(contact_data))
        for contact_data in supplier_data.contacts
    )

    db.add(supplier)
    await db.commit()

    created_supplier = await get_supplier_by_id(db, supplier.id, user_id)
    assert created_supplier is not None
    return created_supplier


async def get_supplier_by_id(
    db: AsyncSession, supplier_id: int, user_id: int
) -> Supplier | None:
    result = await db.execute(
        _supplier_query().where(
            Supplier.id == supplier_id,
            Supplier.user_id == user_id,
            Supplier.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_suppliers(
    db: AsyncSession, user_id: int, include_deleted: bool = False
) -> list[Supplier]:
    query = _supplier_query().where(Supplier.user_id == user_id).order_by(Supplier.name)

    if not include_deleted:
        query = query.where(Supplier.deleted_at.is_(None))

    result = await db.execute(query)
    return list(result.scalars().all())


async def update_supplier(
    db: AsyncSession, supplier_id: int, supplier_data: SupplierUpdate, user_id: int
) -> Supplier | None:
    supplier = await get_supplier_by_id(db, supplier_id, user_id)

    if supplier is None or supplier.deleted_at is not None:
        return None

    update_data = supplier_data.model_dump(exclude_unset=True, exclude={'contacts'})
    for field, value in update_data.items():
        setattr(supplier, field, value)

    if supplier_data.contacts is not None:
        await _replace_supplier_contacts(db, supplier, supplier_data.contacts)

    await db.commit()

    updated_supplier = await get_supplier_by_id(db, supplier_id, user_id)
    assert updated_supplier is not None
    return updated_supplier


async def soft_delete_supplier(
    db: AsyncSession, supplier_id: int, user_id: int
) -> Supplier | None:
    supplier = await get_supplier_by_id(db, supplier_id, user_id)

    if supplier is None:
        return None

    deleted_at = datetime.now(UTC).replace(tzinfo=None)
    await db.execute(
        update(SupplierDocument)
        .where(
            SupplierDocument.supplier_id == supplier.id,
            SupplierDocument.deleted_at.is_(None),
        )
        .values(deleted_at=deleted_at, updated_at=deleted_at)
    )
    supplier.deleted_at = deleted_at

    await db.commit()

    deleted_supplier = await get_supplier_by_id(db, supplier_id, user_id)
    return deleted_supplier or supplier
