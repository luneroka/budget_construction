from datetime import datetime, UTC

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.category import Category
from app.models.product import Product
from app.models.project import Project
from app.models.project_item import ProjectItem
from app.models.project_template import ProjectTemplate
from app.models.project_template_item import ProjectTemplateItem
from app.models.subcategory import Subcategory
from app.schemas.project_item import ProjectItemCreate, ProjectItemUpdate


class ProjectItemValidationError(ValueError):
    pass


def _with_product_hierarchy():
    return (
        joinedload(ProjectItem.product)
        .joinedload(Product.subcategory)
        .joinedload(Subcategory.category)
    )


async def _get_active_project(
    db: AsyncSession, project_id: int, user_id: int
) -> Project | None:
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
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


async def get_project_item_by_id(
    db: AsyncSession,
    project_id: int,
    project_item_id: int,
    user_id: int,
) -> ProjectItem | None:
    result = await db.execute(
        select(ProjectItem)
        .options(_with_product_hierarchy())
        .join(Project, ProjectItem.project_id == Project.id)
        .where(
            ProjectItem.id == project_item_id,
            ProjectItem.project_id == project_id,
            ProjectItem.deleted_at.is_(None),
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )

    return result.scalar_one_or_none()


async def get_project_items(
    db: AsyncSession,
    project_id: int,
    user_id: int,
) -> list[ProjectItem] | None:
    if await _get_active_project(db, project_id, user_id) is None:
        return None

    result = await db.execute(
        select(ProjectItem)
        .options(_with_product_hierarchy())
        .where(
            ProjectItem.project_id == project_id,
            ProjectItem.deleted_at.is_(None),
        )
        .order_by(
            ProjectItem.parent_item_id.nullsfirst(),
            ProjectItem.sort_order,
            ProjectItem.id,
        )
    )

    return list(result.scalars().all())


async def load_project_template(
    db: AsyncSession,
    project_id: int,
    project_template_id: int,
    user_id: int,
) -> list[ProjectItem] | None:
    if await _get_active_project(db, project_id, user_id) is None:
        return None

    result = await db.execute(
        select(ProjectTemplate).where(
            ProjectTemplate.id == project_template_id,
            ProjectTemplate.is_active.is_(True),
        )
    )
    if result.scalar_one_or_none() is None:
        raise ProjectItemValidationError('Project template not found or inactive')

    result = await db.execute(
        select(ProjectItem.id)
        .join(
            ProjectTemplateItem,
            ProjectItem.template_item_id == ProjectTemplateItem.id,
        )
        .where(
            ProjectItem.project_id == project_id,
            ProjectItem.deleted_at.is_(None),
            ProjectTemplateItem.project_template_id == project_template_id,
        )
        .limit(1)
    )
    if result.scalar_one_or_none() is not None:
        raise ProjectItemValidationError(
            'This project template has already been loaded into the project'
        )

    result = await db.execute(
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
    template_items = list(result.scalars().all())

    for template_item in template_items:
        product = template_item.product
        if (
            not product.is_active
            or not product.subcategory.is_active
            or not product.subcategory.category.is_active
        ):
            raise ProjectItemValidationError(
                f'Product {template_item.product_id} not found or inactive'
            )

    for template_item in template_items:
        project_item = ProjectItem(
            project_id=project_id,
            template_item_id=template_item.id,
            product_id=template_item.product_id,
            name=template_item.default_name,
            is_custom=False,
            is_breakdown_item=False,
            sort_order=template_item.sort_order,
        )
        db.add(project_item)

    await db.commit()

    project_items = await get_project_items(db, project_id, user_id)
    assert project_items is not None

    return project_items


async def _validate_parent(
    db: AsyncSession,
    *,
    project_id: int,
    parent_item_id: int | None,
    product_id: int,
    user_id: int,
    project_item_id: int | None = None,
) -> ProjectItem | None:
    if parent_item_id is None:
        return None

    if parent_item_id == project_item_id:
        raise ProjectItemValidationError('A project item cannot be its own parent')

    parent_item = await get_project_item_by_id(db, project_id, parent_item_id, user_id)
    if parent_item is None:
        raise ProjectItemValidationError('Parent project item not found')

    if parent_item.product_id != product_id:
        raise ProjectItemValidationError(
            'A breakdown item must use the same product as its parent'
        )

    if parent_item.parent_item_id is not None:
        raise ProjectItemValidationError('Nested breakdown items are not allowed')

    return parent_item


async def _has_active_children(db: AsyncSession, project_item_id: int) -> bool:
    result = await db.execute(
        select(ProjectItem.id)
        .where(
            ProjectItem.parent_item_id == project_item_id,
            ProjectItem.deleted_at.is_(None),
        )
        .limit(1)
    )

    return result.scalar_one_or_none() is not None


async def create_project_item(
    db: AsyncSession,
    project_id: int,
    project_item_create: ProjectItemCreate,
    user_id: int,
) -> ProjectItem | None:
    if await _get_active_project(db, project_id, user_id) is None:
        return None

    if await _get_active_product(db, project_item_create.product_id) is None:
        raise ProjectItemValidationError('Product not found')

    await _validate_parent(
        db,
        project_id=project_id,
        parent_item_id=project_item_create.parent_item_id,
        product_id=project_item_create.product_id,
        user_id=user_id,
    )

    project_item = ProjectItem(
        **project_item_create.model_dump(),
        project_id=project_id,
        is_breakdown_item=project_item_create.parent_item_id is not None,
    )
    db.add(project_item)
    await db.commit()

    return await get_project_item_by_id(db, project_id, project_item.id, user_id)


async def update_project_item(
    db: AsyncSession,
    project_id: int,
    project_item_id: int,
    project_item_update: ProjectItemUpdate,
    user_id: int,
) -> ProjectItem | None:
    project_item = await get_project_item_by_id(
        db, project_id, project_item_id, user_id
    )
    if project_item is None:
        return None

    update_data = project_item_update.model_dump(exclude_unset=True)
    parent_item_id = update_data.pop('parent_item_id', project_item.parent_item_id)

    await _validate_parent(
        db,
        project_id=project_id,
        parent_item_id=parent_item_id,
        product_id=project_item.product_id,
        user_id=user_id,
        project_item_id=project_item.id,
    )

    if parent_item_id is not None and await _has_active_children(db, project_item.id):
        raise ProjectItemValidationError(
            'A project item with breakdown items cannot become a breakdown item'
        )

    for field, value in update_data.items():
        setattr(project_item, field, value)

    project_item.parent_item_id = parent_item_id
    project_item.is_breakdown_item = parent_item_id is not None

    await db.commit()

    return await get_project_item_by_id(db, project_id, project_item.id, user_id)


async def soft_delete_project_item(
    db: AsyncSession,
    project_id: int,
    project_item_id: int,
    user_id: int,
) -> ProjectItem | None:
    project_item = await get_project_item_by_id(
        db, project_id, project_item_id, user_id
    )
    if project_item is None:
        return None

    deleted_at = datetime.now(UTC).replace(tzinfo=None)
    project_item.deleted_at = deleted_at

    result = await db.execute(
        select(ProjectItem).where(
            ProjectItem.parent_item_id == project_item.id,
            ProjectItem.deleted_at.is_(None),
        )
    )
    for child_item in result.scalars().all():
        child_item.deleted_at = deleted_at

    await db.commit()

    return project_item
