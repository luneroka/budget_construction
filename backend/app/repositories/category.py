from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category


async def get_category_by_id(db: AsyncSession, category_id: int) -> Category | None:
    result = await db.execute(
        select(Category).where(Category.id == category_id, Category.is_active.is_(True))
    )

    return result.scalar_one_or_none()


async def get_categories(db: AsyncSession) -> list[Category]:
    result = await db.execute(
        select(Category)
        .where(Category.is_active.is_(True))
        .order_by(Category.sort_order)
    )

    return list(result.scalars().all())
