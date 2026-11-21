from collections.abc import Sequence
from datetime import date
from typing import cast

from sqlalchemy import select
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lot import Lot, SupplierLot
from app.models.supplier import Supplier
from app.models.supplier_document import SupplierDocument, SupplierDocumentType
from app.repositories.common import get_active_project
from app.repositories.lot import lot_hidden_in_project, lot_in_project
from app.schemas.financial_engine import DashboardSupplierDocumentRead
from app.schemas.supplier_document import SupplierDocumentUpdate
from app.core.time import utcnow

SupplierDocumentListRow = Row[tuple[SupplierDocument, str]]


async def create_supplier_document(
    db: AsyncSession,
    supplier_id: int,
    user_id: int,
    document_type: SupplierDocumentType,
    expiry_date: date | None,
    original_filename: str,
    stored_filename: str,
    file_path: str,
    mime_type: str,
    file_size: int,
) -> SupplierDocument:
    document = SupplierDocument(
        supplier_id=supplier_id,
        user_id=user_id,
        type=document_type,
        expiry_date=expiry_date,
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


async def update_supplier_document(
    db: AsyncSession, document: SupplierDocument, document_data: SupplierDocumentUpdate
) -> SupplierDocument:
    # Type and expiry date only: the file, its name, size and R2 key stay.
    for field, value in document_data.model_dump(exclude_unset=True).items():
        setattr(document, field, value)
    document.updated_at = utcnow()

    await db.commit()
    await db.refresh(document)

    return document


async def soft_delete_supplier_document(
    db: AsyncSession, document: SupplierDocument
) -> SupplierDocument:
    document.deleted_at = utcnow()

    await db.commit()

    return document


async def get_project_dated_supplier_documents(
    db: AsyncSession, project_id: int, user_id: int
) -> list[DashboardSupplierDocumentRead] | None:
    """The dashboard's supplier-documents widget: the active documents with
    an expiry date of the user's active suppliers assigned to a visible lot
    of the project, soonest expiry first. None when the project is not
    visible to the user."""
    if await get_active_project(db, project_id, user_id) is None:
        return None

    assigned_in_project = (
        select(SupplierLot.supplier_id)
        .join(Lot, SupplierLot.lot_id == Lot.id)
        .where(
            SupplierLot.project_id == project_id,
            SupplierLot.supplier_id == Supplier.id,
            lot_in_project(project_id),
            ~lot_hidden_in_project(project_id),
        )
        .exists()
    )
    result = await db.execute(
        select(SupplierDocument, Supplier.name)
        .join(Supplier, SupplierDocument.supplier_id == Supplier.id)
        .where(
            SupplierDocument.user_id == user_id,
            Supplier.user_id == user_id,
            SupplierDocument.deleted_at.is_(None),
            Supplier.deleted_at.is_(None),
            SupplierDocument.expiry_date.is_not(None),
            assigned_in_project,
        )
        .order_by(SupplierDocument.expiry_date, SupplierDocument.id)
    )
    return [
        DashboardSupplierDocumentRead(
            id=document.id,
            supplier_id=document.supplier_id,
            supplier_name=supplier_name,
            type=document.type,
            expiry_date=document.expiry_date,
            original_filename=document.original_filename,
        )
        for document, supplier_name in result.all()
    ]
