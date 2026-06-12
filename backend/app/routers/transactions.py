from typing import Never

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories.budget_line import BudgetLineValidationError
from app.repositories import transaction as transaction_repository
from app.schemas.transaction import (
    TransactionCreate,
    TransactionCreateForProduct,
    TransactionRead,
    TransactionUpdate,
)
from app.routers.integrity import raise_integrity_conflict
from app.services.transaction import transaction_service

router = APIRouter(
    prefix='/projects/{project_id}/budget-lines/{budget_line_id}/transactions',
    tags=['Transactions'],
)
product_router = APIRouter(
    prefix='/projects/{project_id}/products/{product_id}/transactions',
    tags=['Transactions'],
)


def _bad_request(error: ValueError) -> Never:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


@router.post('/', response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    project_id: int,
    budget_line_id: int,
    transaction_data: TransactionCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        transaction = await transaction_repository.create_transaction(
            db,
            project_id,
            budget_line_id,
            transaction_data,
            current_user.id,
        )
    except transaction_repository.TransactionValidationError as error:
        _bad_request(error)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Budget line not found',
        )

    return transaction


@product_router.post(
    '/',
    response_model=TransactionRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_transaction_for_product(
    project_id: int,
    product_id: int,
    transaction_data: TransactionCreateForProduct,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        transaction = await transaction_service.create_for_product(
            db,
            project_id,
            product_id,
            transaction_data,
            current_user.id,
        )
    except (
        transaction_repository.TransactionValidationError,
        BudgetLineValidationError,
    ) as error:
        _bad_request(error)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Project not found',
        )

    return transaction


@router.get('/', response_model=list[TransactionRead])
async def get_transactions(
    project_id: int,
    budget_line_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    transactions = await transaction_repository.get_transactions_by_budget_line(
        db,
        project_id,
        budget_line_id,
        current_user.id,
    )

    if transactions is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Budget line not found',
        )

    return transactions


@router.get('/{transaction_id}', response_model=TransactionRead)
async def get_transaction(
    project_id: int,
    budget_line_id: int,
    transaction_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    transaction = await transaction_repository.get_transaction_by_id(
        db,
        project_id,
        budget_line_id,
        transaction_id,
        current_user.id,
    )

    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Transaction not found',
        )

    return transaction


@router.patch('/{transaction_id}', response_model=TransactionRead)
async def update_transaction(
    project_id: int,
    budget_line_id: int,
    transaction_id: int,
    transaction_data: TransactionUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        transaction = await transaction_repository.update_transaction(
            db,
            project_id,
            budget_line_id,
            transaction_id,
            transaction_data,
            current_user.id,
        )
    except transaction_repository.TransactionValidationError as error:
        _bad_request(error)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Transaction not found',
        )

    return transaction


@router.delete('/{transaction_id}', response_model=TransactionRead)
async def soft_delete_transaction(
    project_id: int,
    budget_line_id: int,
    transaction_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    transaction = await transaction_repository.soft_delete_transaction(
        db,
        project_id,
        budget_line_id,
        transaction_id,
        current_user.id,
    )

    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Transaction not found',
        )

    return transaction


@router.post('/{transaction_id}/select-budget', response_model=TransactionRead)
async def select_budget_candidate(
    project_id: int,
    budget_line_id: int,
    transaction_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        transaction = await transaction_repository.select_budget_candidate(
            db,
            project_id,
            budget_line_id,
            transaction_id,
            current_user.id,
        )
    except transaction_repository.TransactionValidationError as error:
        _bad_request(error)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Transaction not found',
        )

    return transaction
