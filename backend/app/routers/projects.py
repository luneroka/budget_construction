from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories import project as project_repository
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate

router = APIRouter(prefix='/projects', tags=['Projects'])


# API ENDPOINT TO ADD NEW PROJECT
@router.post('/', response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return await project_repository.create_project(db, project_data, current_user.id)


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
