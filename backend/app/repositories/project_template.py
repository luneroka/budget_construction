from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project_template import ProjectTemplate
from app.schemas.project_template import ProjectTemplateCreate, ProjectTemplateUpdate


async def create_project_template(
    db: AsyncSession, project_template_create: ProjectTemplateCreate
) -> ProjectTemplate:
    project_template = ProjectTemplate(**project_template_create.model_dump())

    db.add(project_template)
    await db.commit()
    await db.refresh(project_template)

    return project_template


async def get_project_template_by_id(
    db: AsyncSession, project_template_id: int
) -> ProjectTemplate | None:
    query = select(ProjectTemplate).where(ProjectTemplate.id == project_template_id)
    result = await db.execute(query)

    return result.scalar_one_or_none()


async def get_project_template_by_name(
    db: AsyncSession, project_template_name: str
) -> ProjectTemplate | None:
    query = select(ProjectTemplate).where(ProjectTemplate.name == project_template_name)
    result = await db.execute(query)

    return result.scalar_one_or_none()


async def get_project_templates(
    db: AsyncSession, include_inactive: bool = False
) -> Sequence[ProjectTemplate]:
    query = select(ProjectTemplate)

    if not include_inactive:
        query = query.where(ProjectTemplate.is_active.is_(True))

    query = query.order_by(ProjectTemplate.name)

    result = await db.execute(query)

    return result.scalars().all()


async def update_project_template(
    db: AsyncSession,
    project_template: ProjectTemplate,
    project_template_update: ProjectTemplateUpdate,
) -> ProjectTemplate:
    update_data = project_template_update.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(project_template, key, value)

    await db.commit()
    await db.refresh(project_template)

    return project_template


async def deactivate_project_template(
    db: AsyncSession,
    project_template: ProjectTemplate,
) -> ProjectTemplate:
    project_template.is_active = False

    await db.commit()
    await db.refresh(project_template)

    return project_template
