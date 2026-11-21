from typing import Never

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.transaction import Transaction
from app.models.user import User
from app.repositories import transaction as transaction_repository
from app.schemas.transaction import (
    ProjectTransactionRead,
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
)
from app.routers._helpers import require_found
from app.routers.integrity import raise_integrity_conflict

router = APIRouter(
    prefix='/projects/{project_id}/transactions',
    tags=['Transactions'],
)


def _bad_request(error: ValueError) -> Never:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


def to_project_transaction_read(transaction: Transaction) -> ProjectTransactionRead:
    active_documents = [
        document
        for document in transaction.documents
        if document.deleted_at is None
    ]
    base = TransactionRead.model_validate(transaction).model_dump()

    return ProjectTransactionRead(
        **base,
        lot_code=transaction.lot.code,
        lot_designation=transaction.lot.designation,
        supplier_name=transaction.supplier.name if transaction.supplier else None,
        document_original_filenames=[
            document.original_filename for document in active_documents
        ],
    )


@router.get('/', response_model=list[ProjectTransactionRead])
async def get_project_transactions(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    transactions = await transaction_repository.get_transactions_by_project(
        db,
        project_id,
        current_user.id,
    )

    transactions = require_found(transactions, 'project_not_found')

    return [to_project_transaction_read(transaction) for transaction in transactions]


@router.post(
    '/', response_model=ProjectTransactionRead, status_code=status.HTTP_201_CREATED
)
async def create_transaction(
    project_id: int,
    transaction_data: TransactionCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        transaction = await transaction_repository.create_transaction(
            db,
            project_id,
            transaction_data,
            current_user.id,
        )
    except transaction_repository.TransactionValidationError as error:
        _bad_request(error)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    return to_project_transaction_read(require_found(transaction, 'project_not_found'))


@router.get('/{transaction_id}', response_model=ProjectTransactionRead)
async def get_transaction(
    project_id: int,
    transaction_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    transaction = await transaction_repository.get_transaction_by_id(
        db,
        project_id,
        transaction_id,
        current_user.id,
    )

    return to_project_transaction_read(
        require_found(transaction, 'transaction_not_found')
    )


@router.patch('/{transaction_id}', response_model=ProjectTransactionRead)
async def update_transaction(
    project_id: int,
    transaction_id: int,
    transaction_data: TransactionUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        transaction = await transaction_repository.update_transaction(
            db,
            project_id,
            transaction_id,
            transaction_data,
            current_user.id,
        )
    except transaction_repository.TransactionValidationError as error:
        _bad_request(error)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    return to_project_transaction_read(
        require_found(transaction, 'transaction_not_found')
    )


@router.delete('/{transaction_id}', response_model=TransactionRead)
async def soft_delete_transaction(
    project_id: int,
    transaction_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    transaction = await transaction_repository.soft_delete_transaction(
        db,
        project_id,
        transaction_id,
        current_user.id,
    )

    return require_found(transaction, 'transaction_not_found')
