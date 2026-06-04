from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories import project_item as project_item_repository
from app.repositories import project as project_repository
from app.schemas.project import (
    GeneratedProjectRead,
    ProjectCreate,
    ProjectFromTemplateCreate,
    ProjectRead,
    ProjectUpdate,
)
from app.services import generate_project as generate_project_service

router = APIRouter(prefix='/projects', tags=['Projects'])


# API ENDPOINT TO ADD NEW PROJECT
@router.post('/', response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return await project_repository.create_project(db, project_data, current_user.id)


@router.post(
    '/from-template',
    response_model=GeneratedProjectRead,
    status_code=status.HTTP_201_CREATED,
)
async def generate_project_from_template(
    project_data: ProjectFromTemplateCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        return await generate_project_service.generate_project_from_template(
            db, project_data, current_user.id
        )
    except project_item_repository.ProjectItemValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error


# API ENDPOINT TO GET ALL PROJECTS
@router.get('/', response_model=list[ProjectRead])
async def get_projects(
    include_deleted: bool = False,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return await project_repository.get_projects(db, current_user.id, include_deleted)


# API ENDPOINT TO GET A PROJECT BY ID
@router.get('/{project_id}', response_model=ProjectRead)
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    project = await project_repository.get_project_by_id(
        db, project_id, current_user.id
    )

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return project


# API ENDPOINT TO UPDATE A PROJECT
@router.patch('/{project_id}', response_model=ProjectRead)
async def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    project = await project_repository.update_project(
        db, project_id, project_data, current_user.id
    )

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return project


# API ENDPOINT TO SOFT DELETE A PROJECT
@router.delete('/{project_id}', response_model=ProjectRead)
async def soft_delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    project = await project_repository.soft_delete_project(
        db, project_id, current_user.id
    )

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return project
