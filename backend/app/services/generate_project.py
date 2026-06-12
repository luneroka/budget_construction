from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget_line import BudgetLine
from app.models.project import Project
from app.repositories.project import validate_project_dates
from app.repositories import budget_line as budget_line_repository
from app.schemas.project import ProjectFromTemplateCreate


@dataclass(frozen=True)
class GeneratedProject:
    project: Project
    budget_lines: list[BudgetLine]


async def generate_project_from_template(
    db: AsyncSession,
    project_data: ProjectFromTemplateCreate,
    user_id: int,
) -> GeneratedProject:
    validate_project_dates(project_data.start_date, project_data.end_date)
    project_values = project_data.model_dump(exclude={'template_id'})
    project = Project(**project_values, user_id=user_id)

    db.add(project)

    try:
        await db.flush()
        budget_lines = await budget_line_repository.load_template(
            db,
            project.id,
            project_data.template_id,
            user_id,
        )
    except Exception:
        await db.rollback()
        raise

    assert budget_lines is not None
    await db.refresh(project)

    return GeneratedProject(project=project, budget_lines=budget_lines)
