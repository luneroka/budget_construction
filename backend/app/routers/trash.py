from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.transaction import Transaction
from app.models.user import User
from app.repositories import trash as trash_repository
from app.schemas.document import DocumentRead
from app.schemas.supplier import SupplierRead
from app.schemas.transaction import TransactionRead
from app.schemas.trash import (
    TrashDocumentRead,
    TrashItemRead,
    TrashSupplierRead,
    TrashTransactionRead,
)

router = APIRouter(prefix='/projects/{project_id}/trash', tags=['Trash'])


def _transaction_name(transaction: Transaction) -> str:
    if transaction.description:
        return transaction.description
    return f'Transaction #{transaction.id}'


def _document_transaction_name(transaction: Transaction) -> str:
    if transaction.description:
        return transaction.description
    return f'Transaction #{transaction.id}'


async def _ensure_project(
    db: AsyncSession,
    project_id: int,
    user_id: int,
) -> None:
    if not await trash_repository.project_exists_for_user(db, project_id, user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Project not found',
        )


@router.get('/', response_model=list[TrashItemRead])
async def get_project_trash(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    await _ensure_project(db, project_id, current_user.id)

    transaction_rows = await trash_repository.get_deleted_transactions(
        db,
        project_id,
        current_user.id,
    )
    document_rows = await trash_repository.get_deleted_documents(
        db,
        project_id,
        current_user.id,
    )
    supplier_rows = await trash_repository.get_deleted_suppliers(
        db,
        project_id,
        current_user.id,
    )

    items: list[TrashItemRead] = []
    for transaction, supplier_name, product_name in transaction_rows:
        assert transaction.deleted_at is not None
        items.append(
            TrashTransactionRead(
                type='transaction',
                id=transaction.id,
                project_id=project_id,
                budget_line_id=transaction.budget_line_id,
                name=_transaction_name(transaction),
                supplier_name=supplier_name,
                product_name=product_name,
                amount_ttc=transaction.amount_ttc,
                deleted_at=transaction.deleted_at,
            )
        )

    for document, transaction, supplier_name in document_rows:
        assert document.deleted_at is not None
        parent_is_deleted = transaction.deleted_at is not None
        items.append(
            TrashDocumentRead(
                type='document',
                id=document.id,
                project_id=project_id,
                transaction_id=document.transaction_id,
                name=document.original_filename,
                transaction_name=_document_transaction_name(transaction),
                transaction_type=transaction.transaction_type,
                transaction_deleted_at=transaction.deleted_at,
                supplier_name=supplier_name,
                deleted_at=document.deleted_at,
                can_restore=not parent_is_deleted,
                restore_blocked_reason=(
                    'Restore the parent transaction first'
                    if parent_is_deleted
                    else None
                ),
            )
        )

    for supplier, linked_transaction_count in supplier_rows:
        assert supplier.deleted_at is not None
        items.append(
            TrashSupplierRead(
                type='supplier',
                id=supplier.id,
                project_id=project_id,
                name=supplier.name,
                linked_transaction_count=linked_transaction_count,
                deleted_at=supplier.deleted_at,
            )
        )

    return sorted(items, key=lambda item: item.deleted_at, reverse=True)


@router.post('/transactions/{transaction_id}/restore', response_model=TransactionRead)
async def restore_transaction(
    project_id: int,
    transaction_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    transaction = await trash_repository.restore_transaction(
        db,
        project_id,
        transaction_id,
        current_user.id,
    )
    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Transaction not found',
        )
    return transaction


@router.post('/documents/{document_id}/restore', response_model=DocumentRead)
async def restore_document(
    project_id: int,
    document_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        document = await trash_repository.restore_document(
            db,
            project_id,
            document_id,
            current_user.id,
        )
    except trash_repository.TrashRestoreError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Document not found',
        )
    return document


@router.post('/suppliers/{supplier_id}/restore', response_model=SupplierRead)
async def restore_supplier(
    project_id: int,
    supplier_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    supplier = await trash_repository.restore_supplier(
        db,
        project_id,
        supplier_id,
        current_user.id,
    )
    if supplier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Supplier not found',
        )
    return supplier
