from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories import supplier as supplier_repository
from app.repositories import supplier_document as supplier_document_repository
from app.routers._helpers import require_found
from app.routers.uploads import StoredFile, upload_document
from app.schemas.document import DocumentDownloadUrl
from app.schemas.supplier_document import SupplierDocumentRead
from app.services.storage import generate_download_url

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
    require_found(
        await supplier_repository.get_supplier_by_id(db, supplier_id, current_user.id),
        'supplier_not_found',
    )

    async def persist(stored: StoredFile):
        return await supplier_document_repository.create_supplier_document(
            db=db,
            supplier_id=supplier_id,
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
        object_prefix=f'documents/user_{current_user.id}/supplier_{supplier_id}',
        persist=persist,
        label='supplier document',
    )


@router.get(
    '/{supplier_id}/documents',
    response_model=list[SupplierDocumentRead],
)
async def get_documents_by_supplier(
    supplier_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    require_found(
        await supplier_repository.get_supplier_by_id(db, supplier_id, current_user.id),
        'supplier_not_found',
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
    document = require_found(
        await supplier_document_repository.get_supplier_document_by_id(
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


@supplier_document_router.delete(
    '/{document_id}',
    status_code=status.HTTP_204_NO_CONTENT,
)
async def soft_delete_supplier_document(
    document_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    document = require_found(
        await supplier_document_repository.get_supplier_document_by_id(
            db=db, document_id=document_id, user_id=current_user.id
        ),
        'document_not_found',
    )

    await supplier_document_repository.soft_delete_supplier_document(
        db=db, document=document
    )
