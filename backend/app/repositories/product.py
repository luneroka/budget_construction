from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.product import Product
from app.models.subcategory import Subcategory


async def get_product_by_id(db: AsyncSession, product_id: int) -> Product | None:
    result = await db.execute(
        select(Product).where(Product.id == product_id, Product.is_active.is_(True))
    )

    return result.scalar_one_or_none()


async def get_products(db: AsyncSession) -> list[Product]:
    result = await db.execute(
        select(Product).where(Product.is_active.is_(True)).order_by(Product.sort_order)
    )

    return list(result.scalars().all())


async def get_products_by_subcategory_id(
    db: AsyncSession, subcategory_id: int
) -> list[Product]:
    result = await db.execute(
        select(Product)
        .where(Product.subcategory_id == subcategory_id, Product.is_active.is_(True))
        .order_by(Product.sort_order)
    )

    return list(result.scalars().all())


async def get_products_with_hierarchy(db: AsyncSession):
    result = await db.execute(
        select(
            Product.id,
            Product.name,
            Product.subcategory_id,
            Product.sort_order,
            Product.is_active,
            Product.created_at,
            Product.updated_at,
            Subcategory.name.label('subcategory_name'),
            Category.id.label('category_id'),
            Category.name.label('category_name'),
        )
        .join(Subcategory, Product.subcategory_id == Subcategory.id)
        .join(Category, Subcategory.category_id == Category.id)
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

    return list(result.mappings().all())
