from datetime import datetime, UTC
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate


async def create_supplier(
    db: AsyncSession, supplier_data: SupplierCreate, user_id: int
) -> Supplier:
    supplier = Supplier(**supplier_data.model_dump(), user_id=user_id)

    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)

    return supplier


async def get_supplier_by_id(
    db: AsyncSession, supplier_id: int, user_id: int
) -> Supplier | None:
    result = await db.execute(
        select(Supplier).where(Supplier.id == supplier_id, Supplier.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_suppliers(
    db: AsyncSession, user_id: int, include_deleted: bool = False
) -> list[Supplier]:
    query = select(Supplier).where(Supplier.user_id == user_id).order_by(Supplier.name)

    if not include_deleted:
        query = query.where(Supplier.deleted_at.is_(None))

    result = await db.execute(query)
    return list(result.scalars().all())


async def soft_delete_supplier(
    db: AsyncSession, supplier_id: int, user_id: int
) -> Supplier | None:
    supplier = await get_supplier_by_id(db, supplier_id, user_id)

    if supplier is None:
        return None

    supplier.deleted_at = datetime.now(UTC).replace(tzinfo=None)

    await db.commit()
    await db.refresh(supplier)

    return supplier
