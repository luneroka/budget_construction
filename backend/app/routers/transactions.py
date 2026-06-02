from typing import Never

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories import transaction as transaction_repository
from app.schemas.transaction import (
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
)

router = APIRouter(
    prefix='/projects/{project_id}/items/{project_item_id}/transactions',
    tags=['Transactions'],
)


def _bad_request(error: transaction_repository.TransactionValidationError) -> Never:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


@router.post('/', response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    project_id: int,
    project_item_id: int,
    transaction_data: TransactionCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        transaction = await transaction_repository.create_transaction(
            db,
            project_id,
            project_item_id,
            transaction_data,
            current_user.id,
        )
    except transaction_repository.TransactionValidationError as error:
        _bad_request(error)

    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Project item not found',
        )

    return transaction


@router.get('/', response_model=list[TransactionRead])
async def get_transactions(
    project_id: int,
    project_item_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    transactions = await transaction_repository.get_transactions_by_project_item(
        db,
        project_id,
        project_item_id,
        current_user.id,
    )

    if transactions is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Project item not found',
        )

    return transactions


@router.get('/{transaction_id}', response_model=TransactionRead)
async def get_transaction(
    project_id: int,
    project_item_id: int,
    transaction_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    transaction = await transaction_repository.get_transaction_by_id(
        db,
        project_id,
        project_item_id,
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
    project_item_id: int,
    transaction_id: int,
    transaction_data: TransactionUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        transaction = await transaction_repository.update_transaction(
            db,
            project_id,
            project_item_id,
            transaction_id,
            transaction_data,
            current_user.id,
        )
    except transaction_repository.TransactionValidationError as error:
        _bad_request(error)

    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Transaction not found',
        )

    return transaction


@router.delete('/{transaction_id}', response_model=TransactionRead)
async def soft_delete_transaction(
    project_id: int,
    project_item_id: int,
    transaction_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    transaction = await transaction_repository.soft_delete_transaction(
        db,
        project_id,
        project_item_id,
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
    project_item_id: int,
    transaction_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        transaction = await transaction_repository.select_budget_candidate(
            db,
            project_id,
            project_item_id,
            transaction_id,
            current_user.id,
        )
    except transaction_repository.TransactionValidationError as error:
        _bad_request(error)

    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Transaction not found',
        )

    return transaction
