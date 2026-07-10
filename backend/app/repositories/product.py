from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload

from app.models.category import Category
from app.models.product import Product
from app.models.subcategory import Subcategory


async def get_product_by_id(db: AsyncSession, product_id: int) -> Product | None:
    result = await db.execute(
        select(Product)
        .options(joinedload(Product.subcategory).joinedload(Subcategory.category))
        .where(Product.id == product_id, Product.is_active.is_(True))
    )

    return result.scalar_one_or_none()


async def get_products(db: AsyncSession) -> list[Product]:
    result = await db.execute(
        select(Product)
        .options(joinedload(Product.subcategory).joinedload(Subcategory.category))
        .where(Product.is_active.is_(True))
        .order_by(Product.sort_order)
    )

    return list(result.scalars().all())


async def get_products_by_subcategory_id(
    db: AsyncSession, subcategory_id: int
) -> list[Product]:
    result = await db.execute(
        select(Product)
        .options(joinedload(Product.subcategory).joinedload(Subcategory.category))
        .where(Product.subcategory_id == subcategory_id, Product.is_active.is_(True))
        .order_by(Product.sort_order)
    )

    return list(result.scalars().all())


async def get_products_with_hierarchy(db: AsyncSession) -> list[Product]:
    result = await db.execute(
        select(Product)
        .join(Subcategory, Product.subcategory_id == Subcategory.id)
        .join(Category, Subcategory.category_id == Category.id)
        .options(
            contains_eager(Product.subcategory).contains_eager(
                Subcategory.category
            )
        )
        .where(
            Product.is_active.is_(True),
            Subcategory.is_active.is_(True),
            Category.is_active.is_(True),
        )
        .order_by(
            Category.sort_order,
            Subcategory.sort_order,
            Product.sort_order,
        )
    )

    return list(result.scalars().all())
