import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories import document as document_repository
from app.repositories import supplier_document as supplier_document_repository
from app.repositories import transaction as transaction_repository
from app.routers._helpers import require_found
from app.routers.uploads import StoredFile, upload_document
from app.schemas.document import DocumentListRead, DocumentRead, DocumentDownloadUrl
from app.schemas.supplier_document import (
    SupplierDocumentListRead,
    SupplierDocumentRead,
)
from app.services.storage import delete_file_from_r2, generate_download_url

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/transactions', tags=['Documents'])
document_router = APIRouter(prefix='/documents', tags=['Documents'])


def _document_list_read(
    row: document_repository.DocumentListRow,
) -> DocumentListRead:
    (
        document,
        project_id,
        transaction_type,
        transaction_description,
        supplier_id,
        supplier_name,
        product_name,
        amount_ttc,
    ) = row
    return DocumentListRead(
        **DocumentRead.model_validate(document).model_dump(),
        project_id=project_id,
        transaction_type=transaction_type,
        transaction_description=transaction_description,
        supplier_id=supplier_id,
        supplier_name=supplier_name,
        product_name=product_name,
        amount_ttc=str(amount_ttc) if amount_ttc is not None else None,
    )


# API ENDPOINT TO ADD NEW DOCUMENT
@router.post(
    '/{transaction_id}/documents',
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_document(
    transaction_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    require_found(
        await transaction_repository.get_transaction_by_id_for_user(
            db=db, transaction_id=transaction_id, user_id=current_user.id
        ),
        'transaction_not_found',
    )

    async def persist(stored: StoredFile):
        return await document_repository.create_document(
            db=db,
            transaction_id=transaction_id,
            user_id=current_user.id,
            original_filename=stored.original_filename,
            stored_filename=stored.stored_filename,
            file_path=stored.object_key,
            mime_type=stored.mime_type,
            file_size=stored.file_size,
        )

    return await upload_document(
        db,
        file,
        object_prefix=f'documents/user_{current_user.id}/transaction_{transaction_id}',
        persist=persist,
        label='document',
    )


@router.get(
    '/{transaction_id}/documents',
    response_model=list[DocumentRead],
)
async def get_documents_by_transaction(
    transaction_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    require_found(
        await transaction_repository.get_transaction_by_id_for_user(
            db=db, transaction_id=transaction_id, user_id=current_user.id
        ),
        'transaction_not_found',
    )

    return await document_repository.get_documents_by_transaction_id(
        db=db,
        transaction_id=transaction_id,
        user_id=current_user.id,
    )


@document_router.get(
    '/',
    response_model=list[DocumentListRead | SupplierDocumentListRead],
)
async def get_documents(
    include_deleted: bool = False,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    rows = await document_repository.get_document_list(
        db=db,
        user_id=current_user.id,
        include_deleted=include_deleted,
    )
    supplier_document_rows = (
        await supplier_document_repository.get_supplier_document_list(
            db=db,
            user_id=current_user.id,
            include_deleted=include_deleted,
        )
    )

    items: list[DocumentListRead | SupplierDocumentListRead] = [
        _document_list_read(row) for row in rows
    ]
    items.extend(
        SupplierDocumentListRead(
            **SupplierDocumentRead.model_validate(document).model_dump(),
            supplier_name=supplier_name,
        )
        for document, supplier_name in supplier_document_rows
    )

    return sorted(items, key=lambda item: item.created_at, reverse=True)


@document_router.get(
    '/{document_id}',
    response_model=DocumentRead,
)
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return require_found(
        await document_repository.get_document_by_id(
            db=db, document_id=document_id, user_id=current_user.id
        ),
        'document_not_found',
    )


@document_router.get(
    '/{document_id}/download-url',
    response_model=DocumentDownloadUrl,
)
async def get_document_download_url(
    document_id: int,
    inline: bool = True,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    document = require_found(
        await document_repository.get_document_by_id(
            db=db, document_id=document_id, user_id=current_user.id
        ),
        'document_not_found',
    )

    url = await run_in_threadpool(
        generate_download_url,
        document.file_path,
        filename=document.original_filename,
        inline=inline,
    )

    return DocumentDownloadUrl(url=url)


@document_router.delete(
    '/{document_id}',
    status_code=status.HTTP_204_NO_CONTENT,
)
async def soft_delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    document = require_found(
        await document_repository.get_document_by_id(
            db=db, document_id=document_id, user_id=current_user.id
        ),
        'document_not_found',
    )

    await document_repository.soft_delete_document(db=db, document=document)


@document_router.delete(
    '/{document_id}/permanent',
    status_code=status.HTTP_204_NO_CONTENT,
)
async def hard_delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    document = require_found(
        await document_repository.get_document_by_id_for_user(
            db=db, document_id=document_id, user_id=current_user.id
        ),
        'document_not_found',
    )

    if document.deleted_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Document must be deleted before permanent deletion',
        )

    try:
        await run_in_threadpool(delete_file_from_r2, document.file_path)
    except Exception as exc:
        logger.exception('Failed to delete document from R2')
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Failed to delete document file',
        ) from exc

    await document_repository.hard_delete_document(db=db, document=document)
