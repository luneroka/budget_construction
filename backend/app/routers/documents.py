import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories import document as document_repository
from app.repositories import supplier_document as supplier_document_repository
from app.repositories import transaction as transaction_repository
from app.schemas.document import DocumentListRead, DocumentRead, DocumentDownloadUrl
from app.schemas.supplier_document import SupplierDocumentListRead
from app.services.document_validation import (
    DocumentUploadValidationError,
    cleanup_uploaded_file as _cleanup_uploaded_file,
    validate_document_upload as _validate_document_upload,
)
from app.services.storage import (
    upload_file_to_r2,
    generate_download_url,
    delete_file_from_r2,
)

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
        supplier_name,
        product_name,
        amount_ttc,
    ) = row
    return DocumentListRead.model_validate(
        {
            **document.__dict__,
            'project_id': project_id,
            'transaction_type': transaction_type,
            'transaction_description': transaction_description,
            'supplier_name': supplier_name,
            'product_name': product_name,
            'amount_ttc': str(amount_ttc) if amount_ttc is not None else None,
        }
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
    transaction = await transaction_repository.get_transaction_by_id_for_user(
        db=db, transaction_id=transaction_id, user_id=current_user.id
    )

    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Transaction not found'
        )

    try:
        original_filename, extension, detected_mime_type, file_size = (
            _validate_document_upload(file)
        )
    except DocumentUploadValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    # Generate stored filename / R2 object key
    stored_filename = f'{uuid.uuid4()}.{extension}'

    object_key = (
        f'documents/user_{current_user.id}/'
        f'transaction_{transaction_id}/'
        f'{stored_filename}'
    )

    try:
        upload_file_to_r2(
            file=file.file, object_key=object_key, content_type=detected_mime_type
        )
    except Exception as exc:
        logger.exception('Failed to upload document to R2')
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Failed to upload document',
        ) from exc

    try:
        return await document_repository.create_document(
            db=db,
            transaction_id=transaction_id,
            user_id=current_user.id,
            original_filename=original_filename,
            stored_filename=stored_filename,
            file_path=object_key,
            mime_type=detected_mime_type,
            file_size=file_size,
        )
    except Exception as exc:
        await db.rollback()
        _cleanup_uploaded_file(object_key)
        logger.exception('Failed to persist uploaded document metadata')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Failed to save document metadata',
        ) from exc


@router.get(
    '/{transaction_id}/documents',
    response_model=list[DocumentRead],
)
async def get_documents_by_transaction(
    transaction_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    transaction = await transaction_repository.get_transaction_by_id_for_user(
        db=db,
        transaction_id=transaction_id,
        user_id=current_user.id,
    )

    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Transaction not found',
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
        SupplierDocumentListRead.model_validate(
            {**document.__dict__, 'supplier_name': supplier_name}
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
    document = await document_repository.get_document_by_id(
        db=db,
        document_id=document_id,
        user_id=current_user.id,
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Document not found',
        )

    return document


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
    document = await document_repository.get_document_by_id(
        db=db,
        document_id=document_id,
        user_id=current_user.id,
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Document not found',
        )

    url = generate_download_url(
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
    document = await document_repository.get_document_by_id(
        db=db,
        document_id=document_id,
        user_id=current_user.id,
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Document not found',
        )

    await document_repository.soft_delete_document(
        db=db,
        document=document,
    )


@document_router.delete(
    '/{document_id}/permanent',
    status_code=status.HTTP_204_NO_CONTENT,
)
async def hard_delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    document = await document_repository.get_document_by_id_for_user(
        db=db,
        document_id=document_id,
        user_id=current_user.id,
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Document not found',
        )

    if document.deleted_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Document must be deleted before permanent deletion',
        )

    try:
        delete_file_from_r2(document.file_path)
    except Exception as exc:
        logger.exception('Failed to delete document from R2')
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Failed to delete document file',
        ) from exc

    await document_repository.hard_delete_document(db=db, document=document)
