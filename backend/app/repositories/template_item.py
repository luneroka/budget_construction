from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.category import Category
from app.models.product import Product
from app.models.template import Template
from app.models.template_item import TemplateItem
from app.models.subcategory import Subcategory
from app.schemas.template_item import (
    TemplateItemCreate,
    TemplateItemUpdate,
)


class TemplateItemValidationError(ValueError):
    pass


def _with_product_hierarchy():
    return (
        joinedload(TemplateItem.product)
        .joinedload(Product.subcategory)
        .joinedload(Subcategory.category)
    )


async def _get_template(db: AsyncSession, template_id: int) -> Template | None:
    result = await db.execute(select(Template).where(Template.id == template_id))

    return result.scalar_one_or_none()


async def _get_active_product(db: AsyncSession, product_id: int) -> Product | None:
    result = await db.execute(
        select(Product)
        .join(Subcategory, Product.subcategory_id == Subcategory.id)
        .join(Category, Subcategory.category_id == Category.id)
        .where(
            Product.id == product_id,
            Product.is_active.is_(True),
            Subcategory.is_active.is_(True),
            Category.is_active.is_(True),
        )
    )

    return result.scalar_one_or_none()


async def create_template_item(
    db: AsyncSession,
    template_id: int,
    template_item_create: TemplateItemCreate,
) -> TemplateItem | None:
    if await _get_template(db, template_id) is None:
        return None

    await _validate_item_data(
        db,
        product_id=template_item_create.product_id,
    )

    template_item = TemplateItem(
        **template_item_create.model_dump(),
        template_id=template_id,
    )

    db.add(template_item)
    await db.commit()

    created_item = await get_template_item_by_id(db, template_id, template_item.id)
    assert created_item is not None

    return created_item


async def get_template_item_by_id(
    db: AsyncSession,
    template_id: int,
    template_item_id: int,
) -> TemplateItem | None:
    query = (
        select(TemplateItem)
        .options(_with_product_hierarchy())
        .where(
            TemplateItem.id == template_item_id,
            TemplateItem.template_id == template_id,
        )
    )
    result = await db.execute(query)

    return result.scalar_one_or_none()


async def get_template_items_by_template_id(
    db: AsyncSession,
    template_id: int,
) -> Sequence[TemplateItem]:
    query = (
        select(TemplateItem)
        .options(
            joinedload(TemplateItem.product)
            .joinedload(Product.subcategory)
            .joinedload(Subcategory.category)
        )
        .where(TemplateItem.template_id == template_id)
        .order_by(
            TemplateItem.sort_order,
            TemplateItem.id,
        )
    )

    result = await db.execute(query)

    return result.scalars().all()


async def _validate_item_data(
    db: AsyncSession,
    *,
    product_id: int,
) -> None:
    if await _get_active_product(db, product_id) is None:
        raise TemplateItemValidationError('Product not found')


async def update_template_item(
    db: AsyncSession,
    template_item: TemplateItem,
    template_item_update: TemplateItemUpdate,
) -> TemplateItem:
    update_data = template_item_update.model_dump(exclude_unset=True)
    product_id = update_data.get('product_id', template_item.product_id)

    await _validate_item_data(
        db,
        product_id=product_id,
    )

    for key, value in update_data.items():
        setattr(template_item, key, value)

    await db.commit()

    updated_item = await get_template_item_by_id(
        db, template_item.template_id, template_item.id
    )
    assert updated_item is not None

    return updated_item


async def delete_template_item(
    db: AsyncSession,
    template_item: TemplateItem,
) -> None:
    await db.delete(template_item)
    await db.commit()


async def create_template_items_bulk(
    db: AsyncSession,
    template_id: int,
    template_items_create: list[TemplateItemCreate],
) -> Sequence[TemplateItem] | None:
    if await _get_template(db, template_id) is None:
        return None

    for item in template_items_create:
        await _validate_item_data(
            db,
            product_id=item.product_id,
        )

    template_items = [
        TemplateItem(**item.model_dump(), template_id=template_id)
        for item in template_items_create
    ]

    db.add_all(template_items)
    await db.commit()

    item_ids = [item.id for item in template_items]
    result = await db.execute(
        select(TemplateItem)
        .options(_with_product_hierarchy())
        .where(TemplateItem.id.in_(item_ids))
    )
    items_by_id = {item.id: item for item in result.scalars().all()}

    return [items_by_id[item_id] for item_id in item_ids]
