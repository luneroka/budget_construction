"""The upload pipeline shared by transaction documents and supplier documents.

validate -> uuid object key -> upload to R2 -> persist metadata, with the
R2 object removed again if persisting fails. Routers keep only the
ownership check and the repository call.
"""

import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TypeVar

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.services.document_validation import (
    DocumentUploadValidationError,
    cleanup_uploaded_file,
    validate_document_upload,
)
from app.services.storage import upload_file_to_r2

logger = logging.getLogger(__name__)

T = TypeVar('T')


@dataclass(frozen=True)
class StoredFile:
    original_filename: str
    stored_filename: str
    object_key: str
    mime_type: str
    file_size: int


async def upload_document(
    db: AsyncSession,
    file: UploadFile,
    *,
    object_prefix: str,
    persist: Callable[[StoredFile], Awaitable[T]],
    label: str,
) -> T:
    """Store ``file`` under ``object_prefix`` and persist it with ``persist``.

    ``object_prefix`` is the R2 "folder" (``documents/user_1/transaction_2``);
    ``persist`` writes the metadata row and commits; ``label`` names the kind
    of document in log lines.
    """
    try:
        original_filename, extension, mime_type, file_size = (
            validate_document_upload(file)
        )
    except DocumentUploadValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    stored_filename = f'{uuid.uuid4()}.{extension}'
    object_key = f'{object_prefix}/{stored_filename}'

    try:
        await run_in_threadpool(
            upload_file_to_r2,
            file=file.file,
            object_key=object_key,
            content_type=mime_type,
        )
    except Exception as exc:
        logger.exception('Failed to upload %s to R2', label)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Failed to upload document',
        ) from exc

    stored = StoredFile(
        original_filename=original_filename,
        stored_filename=stored_filename,
        object_key=object_key,
        mime_type=mime_type,
        file_size=file_size,
    )

    try:
        return await persist(stored)
    except Exception as exc:
        await db.rollback()
        await run_in_threadpool(cleanup_uploaded_file, object_key)
        logger.exception('Failed to persist uploaded %s metadata', label)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Failed to save document metadata',
        ) from exc
