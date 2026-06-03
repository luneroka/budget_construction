import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories import document as document_repository
from app.repositories import transaction as transaction_repository
from app.schemas.document import DocumentRead, DocumentDownloadUrl
from app.services.storage import (
    upload_file_to_r2,
    generate_download_url,
    delete_file_from_r2,
)

ALLOWED_MIME_TYPES = {
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
}

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/transactions', tags=['Documents'])
document_router = APIRouter(prefix='/documents', tags=['Documents'])


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

    if file.filename is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Missing filename',
        )

    if file.content_type is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Missing file content type',
        )

    # Verify content_type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Unsupported file type',
        )

    # Verify file size
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='File is too large',
        )

    # Generate stored filename / R2 object key
    extension = file.filename.rsplit('.', 1)[-1].lower()
    stored_filename = f'{uuid.uuid4()}.{extension}'

    object_key = (
        f'documents/user_{current_user.id}/'
        f'transaction_{transaction_id}/'
        f'{stored_filename}'
    )

    try:
        upload_file_to_r2(
            file=file.file, object_key=object_key, content_type=file.content_type
        )
    except Exception as exc:
        logger.exception('Failed to upload document to R2')
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Failed to upload document',
        ) from exc

    return await document_repository.create_document(
        db=db,
        transaction_id=transaction_id,
        user_id=current_user.id,
        original_filename=file.filename,
        stored_filename=stored_filename,
        file_path=object_key,
        mime_type=file.content_type,
        file_size=file_size,
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

    url = generate_download_url(document.file_path)

    return DocumentDownloadUrl(url=url)


@document_router.delete(
    '/{document_id}',
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_document(
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

    try:
        delete_file_from_r2(document.file_path)
    except Exception as exc:
        logger.exception('Failed to delete document from R2')
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Failed to delete document file',
        ) from exc

    await document_repository.soft_delete_document(
        db=db,
        document_id=document_id,
        user_id=current_user.id,
    )
