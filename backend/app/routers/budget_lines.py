from typing import Never

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories import budget_line as budget_line_repository
from app.routers.integrity import raise_integrity_conflict
from app.schemas.budget_line import (
    BudgetLineCreate,
    BudgetLineRead,
    BudgetLineUpdate,
    ProductLineConvertToBreakdown,
)
from app.services.budget_line import budget_line_service

router = APIRouter(prefix='/projects/{project_id}/budget-lines', tags=['Budget Lines'])
product_router = APIRouter(
    prefix='/projects/{project_id}/products/{product_id}/budget-lines',
    tags=['Budget Lines'],
)


def _bad_request(error: budget_line_repository.BudgetLineValidationError) -> Never:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


@router.post('/', response_model=BudgetLineRead, status_code=status.HTTP_201_CREATED)
async def create_budget_line(
    project_id: int,
    budget_line_data: BudgetLineCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        budget_line = await budget_line_repository.create_budget_line(
            db, project_id, budget_line_data, current_user.id
        )
    except budget_line_repository.BudgetLineValidationError as error:
        _bad_request(error)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    if budget_line is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return budget_line


@router.get('/', response_model=list[BudgetLineRead])
async def get_budget_lines(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    budget_lines = await budget_line_repository.get_budget_lines(
        db, project_id, current_user.id
    )

    if budget_lines is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return budget_lines


@router.post(
    '/from-template/{template_id}',
    response_model=list[BudgetLineRead],
    status_code=status.HTTP_201_CREATED,
)
async def load_template(
    project_id: int,
    template_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        budget_lines = await budget_line_repository.load_template(
            db, project_id, template_id, current_user.id
        )
    except budget_line_repository.BudgetLineValidationError as error:
        _bad_request(error)

    if budget_lines is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return budget_lines


@router.get('/{budget_line_id}', response_model=BudgetLineRead)
async def get_budget_line(
    project_id: int,
    budget_line_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    budget_line = await budget_line_repository.get_budget_line_by_id(
        db, project_id, budget_line_id, current_user.id
    )

    if budget_line is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Budget line not found'
        )

    return budget_line


@router.patch('/{budget_line_id}', response_model=BudgetLineRead)
async def update_budget_line(
    project_id: int,
    budget_line_id: int,
    budget_line_data: BudgetLineUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        budget_line = await budget_line_repository.update_budget_line(
            db, project_id, budget_line_id, budget_line_data, current_user.id
        )
    except budget_line_repository.BudgetLineValidationError as error:
        _bad_request(error)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    if budget_line is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Budget line not found'
        )

    return budget_line


@router.delete('/{budget_line_id}', response_model=BudgetLineRead)
async def soft_delete_budget_line(
    project_id: int,
    budget_line_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    budget_line = await budget_line_repository.soft_delete_budget_line(
        db, project_id, budget_line_id, current_user.id
    )

    if budget_line is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Budget line not found'
        )

    return budget_line


@product_router.post(
    '/convert-to-breakdown',
    response_model=list[BudgetLineRead],
    status_code=status.HTTP_201_CREATED,
)
async def convert_product_line_to_breakdown_lines(
    project_id: int,
    product_id: int,
    conversion_data: ProductLineConvertToBreakdown,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        budget_lines = await budget_line_service.convert_product_line_to_breakdown_lines(
            db,
            project_id,
            product_id,
            conversion_data,
            current_user.id,
        )
    except budget_line_repository.BudgetLineValidationError as error:
        _bad_request(error)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    if budget_lines is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return budget_lines
