from typing import Never

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.repositories import project_template as project_template_repository
from app.repositories import project_template_item as project_template_item_repository
from app.schemas.project_template_item import (
    ProjectTemplateItemCreate,
    ProjectTemplateItemRead,
    ProjectTemplateItemUpdate,
)

router = APIRouter(
    prefix='/project-templates/{project_template_id}/items',
    tags=['Project Template Items'],
    dependencies=[Depends(get_current_user)],
)


def _bad_request(
    error: project_template_item_repository.ProjectTemplateItemValidationError,
) -> Never:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


async def _require_project_template(
    db: AsyncSession, project_template_id: int
) -> None:
    if (
        await project_template_repository.get_project_template_by_id(
            db, project_template_id
        )
        is None
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Project template not found',
        )


@router.post('/', response_model=ProjectTemplateItemRead, status_code=status.HTTP_201_CREATED)
async def create_project_template_item(
    project_template_id: int,
    project_template_item_data: ProjectTemplateItemCreate,
    db: AsyncSession = Depends(get_db_session),
):
    try:
        project_template_item = (
            await project_template_item_repository.create_project_template_item(
                db, project_template_id, project_template_item_data
            )
        )
    except project_template_item_repository.ProjectTemplateItemValidationError as error:
        _bad_request(error)

    if project_template_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Project template not found',
        )

    return project_template_item


@router.post(
    '/bulk',
    response_model=list[ProjectTemplateItemRead],
    status_code=status.HTTP_201_CREATED,
)
async def create_project_template_items_bulk(
    project_template_id: int,
    project_template_items_data: list[ProjectTemplateItemCreate],
    db: AsyncSession = Depends(get_db_session),
):
    try:
        project_template_items = (
            await project_template_item_repository.create_project_template_items_bulk(
                db, project_template_id, project_template_items_data
            )
        )
    except project_template_item_repository.ProjectTemplateItemValidationError as error:
        _bad_request(error)

    if project_template_items is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Project template not found',
        )

    return project_template_items


@router.get('/', response_model=list[ProjectTemplateItemRead])
async def get_project_template_items(
    project_template_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    await _require_project_template(db, project_template_id)

    return await project_template_item_repository.get_project_template_items_by_template_id(
        db, project_template_id
    )


@router.get('/{project_template_item_id}', response_model=ProjectTemplateItemRead)
async def get_project_template_item(
    project_template_id: int,
    project_template_item_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    project_template_item = (
        await project_template_item_repository.get_project_template_item_by_id(
            db, project_template_id, project_template_item_id
        )
    )
    if project_template_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Project template item not found',
        )

    return project_template_item


@router.get(
    '/{project_template_item_id}/children',
    response_model=list[ProjectTemplateItemRead],
)
async def get_child_template_items(
    project_template_id: int,
    project_template_item_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    project_template_item = (
        await project_template_item_repository.get_project_template_item_by_id(
            db, project_template_id, project_template_item_id
        )
    )
    if project_template_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Project template item not found',
        )

    return await project_template_item_repository.get_child_template_items(
        db, project_template_id, project_template_item_id
    )


@router.patch('/{project_template_item_id}', response_model=ProjectTemplateItemRead)
async def update_project_template_item(
    project_template_id: int,
    project_template_item_id: int,
    project_template_item_data: ProjectTemplateItemUpdate,
    db: AsyncSession = Depends(get_db_session),
):
    project_template_item = (
        await project_template_item_repository.get_project_template_item_by_id(
            db, project_template_id, project_template_item_id
        )
    )
    if project_template_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Project template item not found',
        )

    try:
        return await project_template_item_repository.update_project_template_item(
            db, project_template_item, project_template_item_data
        )
    except project_template_item_repository.ProjectTemplateItemValidationError as error:
        _bad_request(error)


@router.delete('/{project_template_item_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_template_item(
    project_template_id: int,
    project_template_item_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    project_template_item = (
        await project_template_item_repository.get_project_template_item_by_id(
            db, project_template_id, project_template_item_id
        )
    )
    if project_template_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Project template item not found',
        )

    await project_template_item_repository.delete_project_template_item(
        db, project_template_item
    )
