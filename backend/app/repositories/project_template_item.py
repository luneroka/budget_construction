from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project_template_item import ProjectTemplateItem
from app.schemas.project_template_item import (
    ProjectTemplateItemCreate,
    ProjectTemplateItemUpdate,
)


async def create_project_template_item(
    db: AsyncSession,
    project_template_item_create: ProjectTemplateItemCreate,
) -> ProjectTemplateItem:
    project_template_item = ProjectTemplateItem(
        **project_template_item_create.model_dump()
    )

    db.add(project_template_item)
    await db.commit()
    await db.refresh(project_template_item)

    return project_template_item


async def get_project_template_item_by_id(
    db: AsyncSession,
    project_template_item_id: int,
) -> ProjectTemplateItem | None:
    query = select(ProjectTemplateItem).where(
        ProjectTemplateItem.id == project_template_item_id
    )
    result = await db.execute(query)

    return result.scalar_one_or_none()


async def get_project_template_items_by_template_id(
    db: AsyncSession,
    project_template_id: int,
) -> Sequence[ProjectTemplateItem]:
    query = (
        select(ProjectTemplateItem)
        .where(ProjectTemplateItem.project_template_id == project_template_id)
        .order_by(
            ProjectTemplateItem.parent_template_item_id,
            ProjectTemplateItem.sort_order,
            ProjectTemplateItem.id,
        )
    )

    result = await db.execute(query)

    return result.scalars().all()


async def get_child_template_items(
    db: AsyncSession,
    parent_template_item_id: int,
) -> Sequence[ProjectTemplateItem]:
    query = (
        select(ProjectTemplateItem)
        .where(ProjectTemplateItem.parent_template_item_id == parent_template_item_id)
        .order_by(ProjectTemplateItem.sort_order, ProjectTemplateItem.id)
    )

    result = await db.execute(query)

    return result.scalars().all()


async def update_project_template_item(
    db: AsyncSession,
    project_template_item: ProjectTemplateItem,
    project_template_item_update: ProjectTemplateItemUpdate,
) -> ProjectTemplateItem:
    update_data = project_template_item_update.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(project_template_item, key, value)

    await db.commit()
    await db.refresh(project_template_item)

    return project_template_item


async def delete_project_template_item(
    db: AsyncSession,
    project_template_item: ProjectTemplateItem,
) -> None:
    await db.delete(project_template_item)
    await db.commit()


async def create_project_template_items_bulk(
    db: AsyncSession,
    project_template_items_create: list[ProjectTemplateItemCreate],
) -> Sequence[ProjectTemplateItem]:
    project_template_items = [
        ProjectTemplateItem(**item.model_dump())
        for item in project_template_items_create
    ]

    db.add_all(project_template_items)
    await db.commit()

    for item in project_template_items:
        await db.refresh(item)

    return project_template_items
