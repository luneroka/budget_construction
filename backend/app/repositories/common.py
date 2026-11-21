"""Query fragments shared by several repositories and services.

Ownership and "is this still active" rules live here once, so a change to
them (say, project sharing) is made in one place. Everything a project owns,
transactions included, is reached through its ``project_id``.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project


async def get_active_project(
    db: AsyncSession, project_id: int, user_id: int
) -> Project | None:
    """The project if it exists, belongs to the user and is not soft-deleted."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )

    return result.scalar_one_or_none()
