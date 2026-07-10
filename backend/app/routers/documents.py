import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories import document as document_repository
from app.repositories import transaction as transaction_repository
from app.schemas.document import DocumentListRead, DocumentRead, DocumentDownloadUrl
from app.services.storage import (
    upload_file_to_r2,
    generate_download_url,
    delete_file_from_r2,
)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MIME_EXTENSIONS = {
    'application/pdf': {'pdf'},
    'image/jpeg': {'jpg', 'jpeg'},
    'image/png': {'png'},
    'image/heic': {'heic'},
}
SIGNATURE_READ_SIZE = 32


class DocumentUploadValidationError(ValueError):
    pass


logger = logging.getLogger(__name__)
router = APIRouter(prefix='/transactions', tags=['Documents'])
document_router = APIRouter(prefix='/documents', tags=['Documents'])


def _detect_mime_type(signature: bytes) -> str | None:
    if signature.startswith(b'%PDF-'):
        return 'application/pdf'
    if signature.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if signature.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'

    # HEIC/HEIF files are ISO BMFF containers with an ftyp box near the start.
    if len(signature) >= 12 and signature[4:8] == b'ftyp':
        brand = signature[8:12]
        compatible_brands = signature[16:32]
        heic_brands = {
            b'heic',
            b'heix',
            b'hevc',
            b'hevx',
            b'heim',
            b'heis',
            b'mif1',
            b'msf1',
        }
        if brand in heic_brands or any(
            heic_brand in compatible_brands for heic_brand in heic_brands
        ):
            return 'image/heic'

    return None


def _validate_document_upload(file: UploadFile) -> tuple[str, str, str, int]:
    if not file.filename:
        raise DocumentUploadValidationError('Missing filename')

    original_filename = file.filename

    if '.' not in original_filename:
        raise DocumentUploadValidationError('Missing file extension')

    extension = original_filename.rsplit('.', 1)[-1].lower()
    if extension not in {ext for exts in MIME_EXTENSIONS.values() for ext in exts}:
        raise DocumentUploadValidationError('Unsupported file extension')

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size == 0:
        raise DocumentUploadValidationError('File is empty')
    if file_size > MAX_FILE_SIZE:
        raise DocumentUploadValidationError('File is too large')

    signature = file.file.read(SIGNATURE_READ_SIZE)
    file.file.seek(0)

    detected_mime_type = _detect_mime_type(signature)
    if detected_mime_type is None:
        raise DocumentUploadValidationError('Unsupported or invalid file content')

    if extension not in MIME_EXTENSIONS[detected_mime_type]:
        raise DocumentUploadValidationError(
            'File extension does not match file content'
        )

    return original_filename, extension, detected_mime_type, file_size


def _cleanup_uploaded_file(object_key: str) -> None:
    try:
        delete_file_from_r2(object_key)
    except Exception:
        logger.exception('Failed to clean up uploaded document from R2')


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
    response_model=list[DocumentListRead],
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
    return [_document_list_read(row) for row in rows]


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
