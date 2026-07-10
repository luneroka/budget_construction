from typing import Never

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_admin_user, get_current_user
from app.repositories import template as template_repository
from app.repositories import template_item as template_item_repository
from app.routers.integrity import raise_integrity_conflict
from app.schemas.template_item import (
    TemplateItemCreate,
    TemplateItemRead,
    TemplateItemUpdate,
)

router = APIRouter(
    prefix='/templates/{template_id}/items',
    tags=['Template Items'],
    dependencies=[Depends(get_current_user)],
)


def _bad_request(
    error: template_item_repository.TemplateItemValidationError,
) -> Never:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


async def _require_template(db: AsyncSession, template_id: int) -> None:
    if await template_repository.get_template_by_id(db, template_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Template not found',
        )


@router.post(
    '/',
    response_model=TemplateItemRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_admin_user)],
)
async def create_template_item(
    template_id: int,
    template_item_data: TemplateItemCreate,
    db: AsyncSession = Depends(get_db_session),
):
    try:
        template_item = await template_item_repository.create_template_item(
            db, template_id, template_item_data
        )
    except template_item_repository.TemplateItemValidationError as error:
        _bad_request(error)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    if template_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Template not found',
        )

    return template_item


@router.post(
    '/bulk',
    response_model=list[TemplateItemRead],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_admin_user)],
)
async def create_template_items_bulk(
    template_id: int,
    template_items_data: list[TemplateItemCreate],
    db: AsyncSession = Depends(get_db_session),
):
    try:
        template_items = await template_item_repository.create_template_items_bulk(
            db, template_id, template_items_data
        )
    except template_item_repository.TemplateItemValidationError as error:
        _bad_request(error)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    if template_items is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Template not found',
        )

    return template_items


@router.get('/', response_model=list[TemplateItemRead])
async def get_template_items(
    template_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    await _require_template(db, template_id)

    return await template_item_repository.get_template_items_by_template_id(
        db, template_id
    )


@router.get('/{template_item_id}', response_model=TemplateItemRead)
async def get_template_item(
    template_id: int,
    template_item_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    template_item = await template_item_repository.get_template_item_by_id(
        db, template_id, template_item_id
    )
    if template_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Template item not found',
        )

    return template_item


@router.patch(
    '/{template_item_id}',
    response_model=TemplateItemRead,
    dependencies=[Depends(get_current_admin_user)],
)
async def update_template_item(
    template_id: int,
    template_item_id: int,
    template_item_data: TemplateItemUpdate,
    db: AsyncSession = Depends(get_db_session),
):
    template_item = await template_item_repository.get_template_item_by_id(
        db, template_id, template_item_id
    )
    if template_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Template item not found',
        )

    try:
        return await template_item_repository.update_template_item(
            db, template_item, template_item_data
        )
    except template_item_repository.TemplateItemValidationError as error:
        _bad_request(error)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)


@router.delete(
    '/{template_item_id}',
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_admin_user)],
)
async def delete_template_item(
    template_id: int,
    template_item_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    template_item = await template_item_repository.get_template_item_by_id(
        db, template_id, template_item_id
    )
    if template_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Template item not found',
        )

    await template_item_repository.delete_template_item(db, template_item)
