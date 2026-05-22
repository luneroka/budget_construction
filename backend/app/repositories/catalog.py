from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.product import Product
from app.models.subcategory import Subcategory


async def get_catalog_tree(db: AsyncSession) -> list[dict[str, Any]]:
    result = await db.execute(
        select(
            Category.id.label('category_id'),
            Category.name.label('category_name'),
            Category.sort_order.label('category_sort_order'),
            Category.is_active.label('category_is_active'),
            Subcategory.id.label('subcategory_id'),
            Subcategory.name.label('subcategory_name'),
            Subcategory.sort_order.label('subcategory_sort_order'),
            Subcategory.is_active.label('subcategory_is_active'),
            Product.id.label('product_id'),
            Product.name.label('product_name'),
            Product.sort_order.label('product_sort_order'),
            Product.is_active.label('product_is_active'),
            Product.created_at.label('product_created_at'),
            Product.updated_at.label('product_updated_at'),
        )
        .join(Subcategory, Subcategory.category_id == Category.id)
        .join(Product, Product.subcategory_id == Subcategory.id)
        .where(
            Category.is_active.is_(True),
            Subcategory.is_active.is_(True),
            Product.is_active.is_(True),
        )
        .order_by(
            Category.sort_order,
            Subcategory.sort_order,
            Product.sort_order,
        )
    )

    rows = result.mappings().all()
    categories: dict[int, dict[str, Any]] = {}

    for row in rows:
        category = categories.setdefault(
            row['category_id'],
            {
                'id': row['category_id'],
                'name': row['category_name'],
                'sort_order': row['category_sort_order'],
                'is_active': row['category_is_active'],
                'subcategories_by_id': {},
            },
        )

        subcategories_by_id: dict[int, dict[str, Any]] = category[
            'subcategories_by_id'
        ]
        subcategory = subcategories_by_id.setdefault(
            row['subcategory_id'],
            {
                'id': row['subcategory_id'],
                'name': row['subcategory_name'],
                'sort_order': row['subcategory_sort_order'],
                'is_active': row['subcategory_is_active'],
                'products': [],
            },
        )

        subcategory['products'].append(
            {
                'id': row['product_id'],
                'name': row['product_name'],
                'sort_order': row['product_sort_order'],
                'is_active': row['product_is_active'],
                'created_at': row['product_created_at'],
                'updated_at': row['product_updated_at'],
            }
        )

    return [
        {
            'id': category['id'],
            'name': category['name'],
            'sort_order': category['sort_order'],
            'is_active': category['is_active'],
            'subcategories': list(category['subcategories_by_id'].values()),
        }
        for category in categories.values()
    ]
