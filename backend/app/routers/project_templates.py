from typing import Never

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.repositories import project_template as project_template_repository
from app.schemas.project_template import (
    ProjectTemplateCreate,
    ProjectTemplateRead,
    ProjectTemplateUpdate,
    ProjectTemplateWithItems,
)

router = APIRouter(
    prefix='/project-templates',
    tags=['Project Templates'],
    dependencies=[Depends(get_current_user)],
)


async def _conflict(db: AsyncSession) -> Never:
    await db.rollback()
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail='A project template with this name already exists',
    )


@router.post('/', response_model=ProjectTemplateRead, status_code=status.HTTP_201_CREATED)
async def create_project_template(
    project_template_data: ProjectTemplateCreate,
    db: AsyncSession = Depends(get_db_session),
):
    try:
        return await project_template_repository.create_project_template(
            db, project_template_data
        )
    except IntegrityError:
        await _conflict(db)


@router.get('/', response_model=list[ProjectTemplateRead])
async def get_project_templates(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db_session),
):
    return await project_template_repository.get_project_templates(db, include_inactive)


@router.get('/{project_template_id}', response_model=ProjectTemplateWithItems)
async def get_project_template(
    project_template_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    project_template = await project_template_repository.get_project_template_by_id(
        db, project_template_id
    )
    if project_template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Project template not found',
        )

    return project_template


@router.patch('/{project_template_id}', response_model=ProjectTemplateRead)
async def update_project_template(
    project_template_id: int,
    project_template_data: ProjectTemplateUpdate,
    db: AsyncSession = Depends(get_db_session),
):
    project_template = await project_template_repository.get_project_template_by_id(
        db, project_template_id
    )
    if project_template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Project template not found',
        )

    try:
        return await project_template_repository.update_project_template(
            db, project_template, project_template_data
        )
    except IntegrityError:
        await _conflict(db)


@router.delete('/{project_template_id}', response_model=ProjectTemplateRead)
async def deactivate_project_template(
    project_template_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    project_template = await project_template_repository.get_project_template_by_id(
        db, project_template_id
    )
    if project_template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Project template not found',
        )

    return await project_template_repository.deactivate_project_template(
        db, project_template
    )
