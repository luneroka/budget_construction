import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories import supplier as supplier_repository
from app.repositories import supplier_document as supplier_document_repository
from app.schemas.document import DocumentDownloadUrl
from app.schemas.supplier_document import SupplierDocumentRead
from app.services.document_validation import (
    DocumentUploadValidationError,
    cleanup_uploaded_file,
    validate_document_upload,
)
from app.services.storage import generate_download_url, upload_file_to_r2

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/suppliers', tags=['Supplier Documents'])
supplier_document_router = APIRouter(
    prefix='/supplier-documents', tags=['Supplier Documents']
)


# API ENDPOINT TO ADD NEW SUPPLIER DOCUMENT (RIB)
@router.post(
    '/{supplier_id}/documents',
    response_model=SupplierDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_supplier_document(
    supplier_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    supplier = await supplier_repository.get_supplier_by_id(
        db, supplier_id, current_user.id
    )

    if supplier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Supplier not found'
        )

    try:
        original_filename, extension, detected_mime_type, file_size = (
            validate_document_upload(file)
        )
    except DocumentUploadValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    stored_filename = f'{uuid.uuid4()}.{extension}'

    object_key = (
        f'documents/user_{current_user.id}/'
        f'supplier_{supplier_id}/'
        f'{stored_filename}'
    )

    try:
        upload_file_to_r2(
            file=file.file, object_key=object_key, content_type=detected_mime_type
        )
    except Exception as exc:
        logger.exception('Failed to upload supplier document to R2')
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Failed to upload document',
        ) from exc

    try:
        return await supplier_document_repository.create_supplier_document(
            db=db,
            supplier_id=supplier_id,
            user_id=current_user.id,
            original_filename=original_filename,
            stored_filename=stored_filename,
            file_path=object_key,
            mime_type=detected_mime_type,
            file_size=file_size,
        )
    except Exception as exc:
        await db.rollback()
        cleanup_uploaded_file(object_key)
        logger.exception('Failed to persist uploaded supplier document metadata')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Failed to save document metadata',
        ) from exc


@router.get(
    '/{supplier_id}/documents',
    response_model=list[SupplierDocumentRead],
)
async def get_documents_by_supplier(
    supplier_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    supplier = await supplier_repository.get_supplier_by_id(
        db, supplier_id, current_user.id
    )

    if supplier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Supplier not found'
        )

    return await supplier_document_repository.get_supplier_documents_by_supplier_id(
        db=db,
        supplier_id=supplier_id,
        user_id=current_user.id,
    )


@supplier_document_router.get(
    '/{document_id}/download-url',
    response_model=DocumentDownloadUrl,
)
async def get_supplier_document_download_url(
    document_id: int,
    inline: bool = True,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    document = await supplier_document_repository.get_supplier_document_by_id(
        db=db,
        document_id=document_id,
        user_id=current_user.id,
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Document not found'
        )

    url = generate_download_url(
        document.file_path,
        filename=document.original_filename,
        inline=inline,
    )

    return DocumentDownloadUrl(url=url)


@supplier_document_router.delete(
    '/{document_id}',
    status_code=status.HTTP_204_NO_CONTENT,
)
async def soft_delete_supplier_document(
    document_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    document = await supplier_document_repository.get_supplier_document_by_id(
        db=db,
        document_id=document_id,
        user_id=current_user.id,
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Document not found'
        )

    await supplier_document_repository.soft_delete_supplier_document(
        db=db,
        document=document,
    )
