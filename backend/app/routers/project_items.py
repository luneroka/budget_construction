from typing import Never

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories import project_item as project_item_repository
from app.schemas.project_item import ProjectItemCreate, ProjectItemRead, ProjectItemUpdate

router = APIRouter(prefix='/projects/{project_id}/items', tags=['Project Items'])


def _bad_request(error: project_item_repository.ProjectItemValidationError) -> Never:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


@router.post('/', response_model=ProjectItemRead, status_code=status.HTTP_201_CREATED)
async def create_project_item(
    project_id: int,
    project_item_data: ProjectItemCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        project_item = await project_item_repository.create_project_item(
            db, project_id, project_item_data, current_user.id
        )
    except project_item_repository.ProjectItemValidationError as error:
        _bad_request(error)

    if project_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return project_item


@router.get('/', response_model=list[ProjectItemRead])
async def get_project_items(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    project_items = await project_item_repository.get_project_items(
        db, project_id, current_user.id
    )

    if project_items is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return project_items


@router.post(
    '/from-template/{project_template_id}',
    response_model=list[ProjectItemRead],
    status_code=status.HTTP_201_CREATED,
)
async def load_project_template(
    project_id: int,
    project_template_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        project_items = await project_item_repository.load_project_template(
            db, project_id, project_template_id, current_user.id
        )
    except project_item_repository.ProjectItemValidationError as error:
        _bad_request(error)

    if project_items is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return project_items


@router.get('/{project_item_id}', response_model=ProjectItemRead)
async def get_project_item(
    project_id: int,
    project_item_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    project_item = await project_item_repository.get_project_item_by_id(
        db, project_id, project_item_id, current_user.id
    )

    if project_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project item not found'
        )

    return project_item


@router.patch('/{project_item_id}', response_model=ProjectItemRead)
async def update_project_item(
    project_id: int,
    project_item_id: int,
    project_item_data: ProjectItemUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        project_item = await project_item_repository.update_project_item(
            db, project_id, project_item_id, project_item_data, current_user.id
        )
    except project_item_repository.ProjectItemValidationError as error:
        _bad_request(error)

    if project_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project item not found'
        )

    return project_item


@router.delete('/{project_item_id}', response_model=ProjectItemRead)
async def soft_delete_project_item(
    project_id: int,
    project_item_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    project_item = await project_item_repository.soft_delete_project_item(
        db, project_id, project_item_id, current_user.id
    )

    if project_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project item not found'
        )

    return project_item
