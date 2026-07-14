from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.document import Document
from app.models.supplier import Supplier
from app.models.supplier_document import SupplierDocument
from app.models.transaction import Transaction
from app.models.user import User
from app.repositories import trash as trash_repository
from app.schemas.document import DocumentRead
from app.schemas.supplier import SupplierRead
from app.schemas.supplier_document import SupplierDocumentRead
from app.schemas.transaction import TransactionRead
from app.schemas.trash import (
    TrashDocumentRead,
    TrashItemRead,
    TrashSupplierDocumentRead,
    TrashSupplierRead,
    TrashTransactionRead,
)
from app.services.storage import delete_file_from_r2

router = APIRouter(prefix='/projects/{project_id}/trash', tags=['Trash'])
logger = logging.getLogger(__name__)


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


def _delete_document_files(file_paths: list[str]) -> None:
    for file_path in file_paths:
        try:
            delete_file_from_r2(file_path)
        except Exception as exc:
            logger.exception('Failed to delete document from R2')
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail='Failed to delete document file',
            ) from exc


async def _permanently_delete_transaction(
    db: AsyncSession,
    transaction: Transaction,
) -> None:
    _delete_document_files([document.file_path for document in transaction.documents])
    await trash_repository.permanently_delete_transaction(db, transaction)


async def _permanently_delete_document(
    db: AsyncSession,
    document_id: int,
    document_file_path: str,
) -> None:
    _delete_document_files([document_file_path])
    document = await db.get(Document, document_id)
    if document is None:
        return
    await trash_repository.permanently_delete_document(db, document)


async def _permanently_delete_supplier(
    db: AsyncSession,
    supplier: Supplier,
) -> None:
    _delete_document_files([document.file_path for document in supplier.documents])
    await trash_repository.permanently_delete_supplier(db, supplier)


async def _permanently_delete_supplier_document(
    db: AsyncSession,
    document_id: int,
    document_file_path: str,
) -> None:
    _delete_document_files([document_file_path])
    document = await db.get(SupplierDocument, document_id)
    if document is None:
        return
    await trash_repository.permanently_delete_supplier_document(db, document)


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
    supplier_document_rows = await trash_repository.get_deleted_supplier_documents(
        db,
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

    for supplier_document, supplier in supplier_document_rows:
        assert supplier_document.deleted_at is not None
        parent_is_deleted = supplier.deleted_at is not None
        items.append(
            TrashSupplierDocumentRead(
                type='supplier_document',
                id=supplier_document.id,
                project_id=project_id,
                supplier_id=supplier_document.supplier_id,
                name=supplier_document.original_filename,
                supplier_name=supplier.name,
                supplier_deleted_at=supplier.deleted_at,
                deleted_at=supplier_document.deleted_at,
                can_restore=not parent_is_deleted,
                restore_blocked_reason=(
                    'Restore the parent supplier first' if parent_is_deleted else None
                ),
            )
        )

    return sorted(items, key=lambda item: item.deleted_at, reverse=True)


@router.delete('/', status_code=status.HTTP_204_NO_CONTENT)
async def empty_project_trash(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    await _ensure_project(db, project_id, current_user.id)

    targets = await trash_repository.get_project_permanent_delete_targets(
        db,
        project_id,
        current_user.id,
    )
    _delete_document_files(
        [
            document.file_path
            for transaction in targets.transactions
            for document in transaction.documents
        ]
        + [document.file_path for document in targets.documents]
        + [
            document.file_path
            for supplier in targets.suppliers
            for document in supplier.documents
        ]
        + [document.file_path for document in targets.supplier_documents]
    )
    await trash_repository.permanently_delete_targets(db, targets)


@router.delete(
    '/transactions/{transaction_id}',
    status_code=status.HTTP_204_NO_CONTENT,
)
async def hard_delete_transaction(
    project_id: int,
    transaction_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    transaction = await trash_repository.get_deleted_transaction_for_permanent_delete(
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

    await _permanently_delete_transaction(db, transaction)


@router.delete(
    '/documents/{document_id}',
    status_code=status.HTTP_204_NO_CONTENT,
)
async def hard_delete_document(
    project_id: int,
    document_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    document = await trash_repository.get_deleted_document_for_permanent_delete(
        db,
        project_id,
        document_id,
        current_user.id,
    )
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Document not found',
        )

    await _permanently_delete_document(db, document.id, document.file_path)


@router.delete(
    '/suppliers/{supplier_id}',
    status_code=status.HTTP_204_NO_CONTENT,
)
async def hard_delete_supplier(
    project_id: int,
    supplier_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    await _ensure_project(db, project_id, current_user.id)

    supplier = await trash_repository.get_deleted_supplier_for_permanent_delete(
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

    await _permanently_delete_supplier(db, supplier)


@router.delete(
    '/supplier-documents/{document_id}',
    status_code=status.HTTP_204_NO_CONTENT,
)
async def hard_delete_supplier_document(
    project_id: int,
    document_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    await _ensure_project(db, project_id, current_user.id)

    document = (
        await trash_repository.get_deleted_supplier_document_for_permanent_delete(
            db,
            document_id,
            current_user.id,
        )
    )
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Document not found',
        )

    await _permanently_delete_supplier_document(db, document.id, document.file_path)


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


@router.post(
    '/supplier-documents/{document_id}/restore',
    response_model=SupplierDocumentRead,
)
async def restore_supplier_document(
    project_id: int,
    document_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    await _ensure_project(db, project_id, current_user.id)

    try:
        document = await trash_repository.restore_supplier_document(
            db,
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
    await _ensure_project(db, project_id, current_user.id)

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
