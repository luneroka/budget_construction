from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.repositories import template as template_repository
from app.routers.integrity import raise_integrity_conflict
from app.schemas.template import (
    TemplateCreate,
    TemplateRead,
    TemplateUpdate,
)

router = APIRouter(
    prefix='/templates',
    tags=['Templates'],
    dependencies=[Depends(get_current_user)],
)


@router.post('/', response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
async def create_template(
    template_data: TemplateCreate,
    db: AsyncSession = Depends(get_db_session),
):
    try:
        return await template_repository.create_template(db, template_data)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)


@router.get('/', response_model=list[TemplateRead])
async def get_templates(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db_session),
):
    return await template_repository.get_templates(db, include_inactive)


@router.get('/{template_id}', response_model=TemplateRead)
async def get_template(
    template_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    template = await template_repository.get_template_by_id(db, template_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Template not found',
        )

    return template


@router.patch('/{template_id}', response_model=TemplateRead)
async def update_template(
    template_id: int,
    template_data: TemplateUpdate,
    db: AsyncSession = Depends(get_db_session),
):
    template = await template_repository.get_template_by_id(db, template_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Template not found',
        )

    try:
        return await template_repository.update_template(db, template, template_data)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)


@router.delete('/{template_id}', response_model=TemplateRead)
async def deactivate_template(
    template_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    template = await template_repository.get_template_by_id(db, template_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Template not found',
        )

    return await template_repository.deactivate_template(db, template)
