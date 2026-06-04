from datetime import datetime, UTC
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.project import Project
from app.models.project_item import ProjectItem
from app.models.transaction import Transaction
from app.schemas.project import ProjectCreate, ProjectUpdate


async def create_project(
    db: AsyncSession, project_data: ProjectCreate, user_id: int
) -> Project:
    project = Project(**project_data.model_dump(), user_id=user_id)

    db.add(project)
    await db.commit()
    await db.refresh(project)

    return project


async def get_project_by_id(
    db: AsyncSession, project_id: int, user_id: int
) -> Project | None:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user_id)
    )

    return result.scalar_one_or_none()


async def get_projects(
    db: AsyncSession, user_id: int, include_deleted: bool = False
) -> list[Project]:
    query = select(Project).where(Project.user_id == user_id).order_by(Project.name)

    if not include_deleted:
        query = query.where(Project.deleted_at.is_(None))

    result = await db.execute(query)
    return list(result.scalars().all())


async def update_project(
    db: AsyncSession, project_id: int, project_data: ProjectUpdate, user_id: int
) -> Project | None:
    project = await get_project_by_id(db, project_id, user_id)

    if project is None or project.deleted_at is not None:
        return None

    for field, value in project_data.model_dump(exclude_unset=True).items():
        setattr(project, field, value)

    await db.commit()
    await db.refresh(project)

    return project


async def soft_delete_project(
    db: AsyncSession, project_id: int, user_id: int
) -> Project | None:
    project = await get_project_by_id(db, project_id, user_id)

    if project is None:
        return None

    deleted_at = datetime.now(UTC).replace(tzinfo=None)

    transaction_ids = (
        select(Transaction.id)
        .join(ProjectItem, Transaction.project_item_id == ProjectItem.id)
        .where(
            ProjectItem.project_id == project_id,
            Transaction.deleted_at.is_(None),
        )
    )
    project_item_ids = select(ProjectItem.id).where(
        ProjectItem.project_id == project_id,
        ProjectItem.deleted_at.is_(None),
    )

    await db.execute(
        update(Document)
        .where(
            Document.transaction_id.in_(transaction_ids),
            Document.deleted_at.is_(None),
        )
        .values(deleted_at=deleted_at, updated_at=deleted_at)
    )
    await db.execute(
        update(Transaction)
        .where(Transaction.id.in_(transaction_ids))
        .values(deleted_at=deleted_at, updated_at=deleted_at)
    )
    await db.execute(
        update(ProjectItem)
        .where(ProjectItem.id.in_(project_item_ids))
        .values(deleted_at=deleted_at, updated_at=deleted_at)
    )
    project.deleted_at = deleted_at

    await db.commit()
    await db.refresh(project)

    return project
