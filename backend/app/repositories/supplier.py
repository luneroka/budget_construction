from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate


async def create_supplier(db: AsyncSession, supplier_data: SupplierCreate) -> Supplier:
    supplier = Supplier(**supplier_data.model_dump())

    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)

    return supplier


async def get_supplier_by_id(db: AsyncSession, supplier_id: int) -> Supplier | None:
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    return result.scalar_one_or_none()


async def get_suppliers(db: AsyncSession) -> list[Supplier]:
    result = await db.execute(select(Supplier).order_by(Supplier.name))
    return list(result.scalars().all())