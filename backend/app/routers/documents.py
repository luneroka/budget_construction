from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories import document as document_repository
from app.repositories import transaction as transaction_repository
from app.schemas.document import DocumentRead

ALLOWED_MIME_TYPES = {
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
}

router = APIRouter(prefix='/transactions', tags=['Documents'])


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

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Unsupported file type',
        )

    # TODO: File validation
    # 1. Validate file.content_type
    # 2. Validate file size
    # 3. Generate stored filename / R2 object key
    # 4. Upload to R2
    # 5. Call document_repository.create_document()

    return await document_repository.create_document(
        db=db,
        transaction_id=transaction_id,
        user_id=current_user.id,
        original_filename=file.filename,
        stored_filename='temporary-placeholder.pdf',
        file_path='temporary/r2/object/key.pdf',
        mime_type=file.content_type,
        file_size=0,
    )
