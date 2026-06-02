from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.category import Category
from app.models.product import Product
from app.models.project_template import ProjectTemplate
from app.models.project_template_item import ProjectTemplateItem
from app.models.subcategory import Subcategory
from app.schemas.project_template_item import (
    ProjectTemplateItemCreate,
    ProjectTemplateItemUpdate,
)


class ProjectTemplateItemValidationError(ValueError):
    pass


def _with_product_hierarchy():
    return (
        joinedload(ProjectTemplateItem.product)
        .joinedload(Product.subcategory)
        .joinedload(Subcategory.category)
    )


async def _get_project_template(
    db: AsyncSession, project_template_id: int
) -> ProjectTemplate | None:
    result = await db.execute(
        select(ProjectTemplate).where(ProjectTemplate.id == project_template_id)
    )

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


async def create_project_template_item(
    db: AsyncSession,
    project_template_id: int,
    project_template_item_create: ProjectTemplateItemCreate,
) -> ProjectTemplateItem | None:
    if await _get_project_template(db, project_template_id) is None:
        return None

    await _validate_item_data(
        db,
        product_id=project_template_item_create.product_id,
    )

    project_template_item = ProjectTemplateItem(
        **project_template_item_create.model_dump(),
        project_template_id=project_template_id,
    )

    db.add(project_template_item)
    await db.commit()

    created_item = await get_project_template_item_by_id(
        db, project_template_id, project_template_item.id
    )
    assert created_item is not None

    return created_item


async def get_project_template_item_by_id(
    db: AsyncSession,
    project_template_id: int,
    project_template_item_id: int,
) -> ProjectTemplateItem | None:
    query = (
        select(ProjectTemplateItem)
        .options(_with_product_hierarchy())
        .where(
            ProjectTemplateItem.id == project_template_item_id,
            ProjectTemplateItem.project_template_id == project_template_id,
        )
    )
    result = await db.execute(query)

    return result.scalar_one_or_none()


async def get_project_template_items_by_template_id(
    db: AsyncSession,
    project_template_id: int,
) -> Sequence[ProjectTemplateItem]:
    query = (
        select(ProjectTemplateItem)
        .options(
            joinedload(ProjectTemplateItem.product)
            .joinedload(Product.subcategory)
            .joinedload(Subcategory.category)
        )
        .where(ProjectTemplateItem.project_template_id == project_template_id)
        .order_by(
            ProjectTemplateItem.sort_order,
            ProjectTemplateItem.id,
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
        raise ProjectTemplateItemValidationError('Product not found')


async def update_project_template_item(
    db: AsyncSession,
    project_template_item: ProjectTemplateItem,
    project_template_item_update: ProjectTemplateItemUpdate,
) -> ProjectTemplateItem:
    update_data = project_template_item_update.model_dump(exclude_unset=True)
    product_id = update_data.get('product_id', project_template_item.product_id)

    await _validate_item_data(
        db,
        product_id=product_id,
    )

    for key, value in update_data.items():
        setattr(project_template_item, key, value)

    await db.commit()

    updated_item = await get_project_template_item_by_id(
        db, project_template_item.project_template_id, project_template_item.id
    )
    assert updated_item is not None

    return updated_item


async def delete_project_template_item(
    db: AsyncSession,
    project_template_item: ProjectTemplateItem,
) -> None:
    await db.delete(project_template_item)
    await db.commit()


async def create_project_template_items_bulk(
    db: AsyncSession,
    project_template_id: int,
    project_template_items_create: list[ProjectTemplateItemCreate],
) -> Sequence[ProjectTemplateItem] | None:
    if await _get_project_template(db, project_template_id) is None:
        return None

    for item in project_template_items_create:
        await _validate_item_data(
            db,
            product_id=item.product_id,
        )

    project_template_items = [
        ProjectTemplateItem(
            **item.model_dump(), project_template_id=project_template_id
        )
        for item in project_template_items_create
    ]

    db.add_all(project_template_items)
    await db.commit()

    item_ids = [item.id for item in project_template_items]
    result = await db.execute(
        select(ProjectTemplateItem)
        .options(_with_product_hierarchy())
        .where(ProjectTemplateItem.id.in_(item_ids))
    )
    items_by_id = {item.id: item for item in result.scalars().all()}

    return [items_by_id[item_id] for item_id in item_ids]
