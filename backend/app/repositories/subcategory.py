from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subcategory import Subcategory


async def get_subcategory_by_id(
    db: AsyncSession, subcategory_id: int
) -> Subcategory | None:
    result = await db.execute(
        select(Subcategory).where(
            Subcategory.id == subcategory_id, Subcategory.is_active.is_(True)
        )
    )

    return result.scalar_one_or_none()


async def get_subcategories(db: AsyncSession) -> list[Subcategory]:
    result = await db.execute(
        select(Subcategory)
        .where(Subcategory.is_active.is_(True))
        .order_by(Subcategory.sort_order)
    )

    return list(result.scalars().all())


async def get_subcategories_by_category_id(
    db: AsyncSession, category_id: int
) -> list[Subcategory]:
    result = await db.execute(
        select(Subcategory)
        .where(Subcategory.category_id == category_id, Subcategory.is_active.is_(True))
        .order_by(Subcategory.sort_order)
    )

    return list(result.scalars().all())
