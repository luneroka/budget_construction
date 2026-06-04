from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.project_item import ProjectItem
from app.repositories import project_item as project_item_repository
from app.schemas.project import ProjectFromTemplateCreate


@dataclass(frozen=True)
class GeneratedProject:
    project: Project
    project_items: list[ProjectItem]


async def generate_project_from_template(
    db: AsyncSession,
    project_data: ProjectFromTemplateCreate,
    user_id: int,
) -> GeneratedProject:
    project_values = project_data.model_dump(exclude={'template_id'})
    project = Project(**project_values, user_id=user_id)

    db.add(project)

    try:
        await db.flush()
        project_items = await project_item_repository.load_template(
            db,
            project.id,
            project_data.template_id,
            user_id,
        )
    except Exception:
        await db.rollback()
        raise

    assert project_items is not None
    await db.refresh(project)

    return GeneratedProject(project=project, project_items=project_items)
