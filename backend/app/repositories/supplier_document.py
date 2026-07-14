from collections.abc import Sequence
from datetime import UTC, datetime
from typing import cast

from sqlalchemy import select
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.models.supplier_document import SupplierDocument

SupplierDocumentListRow = Row[tuple[SupplierDocument, str]]


async def create_supplier_document(
    db: AsyncSession,
    supplier_id: int,
    user_id: int,
    original_filename: str,
    stored_filename: str,
    file_path: str,
    mime_type: str,
    file_size: int,
) -> SupplierDocument:
    document = SupplierDocument(
        supplier_id=supplier_id,
        user_id=user_id,
        original_filename=original_filename,
        stored_filename=stored_filename,
        file_path=file_path,
        mime_type=mime_type,
        file_size=file_size,
    )

    db.add(document)
    await db.commit()
    await db.refresh(document)

    return document


async def get_supplier_documents_by_supplier_id(
    db: AsyncSession, supplier_id: int, user_id: int, include_deleted: bool = False
) -> list[SupplierDocument]:
    query = (
        select(SupplierDocument)
        .where(
            SupplierDocument.supplier_id == supplier_id,
            SupplierDocument.user_id == user_id,
        )
        .order_by(SupplierDocument.created_at.desc())
    )

    if not include_deleted:
        query = query.where(SupplierDocument.deleted_at.is_(None))

    result = await db.execute(query)
    return list(result.scalars().all())


async def get_supplier_document_list(
    db: AsyncSession, user_id: int, include_deleted: bool = False
) -> Sequence[SupplierDocumentListRow]:
    query = (
        select(SupplierDocument, Supplier.name)
        .join(Supplier, SupplierDocument.supplier_id == Supplier.id)
        .where(SupplierDocument.user_id == user_id)
        .order_by(SupplierDocument.created_at.desc())
    )

    if not include_deleted:
        query = query.where(
            SupplierDocument.deleted_at.is_(None),
            Supplier.deleted_at.is_(None),
        )

    result = await db.execute(query)
    return cast(Sequence[SupplierDocumentListRow], list(result.all()))


async def get_supplier_document_by_id(
    db: AsyncSession, document_id: int, user_id: int
) -> SupplierDocument | None:
    result = await db.execute(
        select(SupplierDocument).where(
            SupplierDocument.id == document_id,
            SupplierDocument.user_id == user_id,
            SupplierDocument.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def soft_delete_supplier_document(
    db: AsyncSession, document: SupplierDocument
) -> SupplierDocument:
    document.deleted_at = datetime.now(UTC).replace(tzinfo=None)

    await db.commit()

    return document
