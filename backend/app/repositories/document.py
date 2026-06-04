from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.project import Project
from app.models.project_item import ProjectItem
from app.models.transaction import Transaction


async def create_document(
    db: AsyncSession,
    transaction_id: int,
    user_id: int,
    original_filename: str,
    stored_filename: str,
    file_path: str,
    mime_type: str,
    file_size: int,
) -> Document:
    document = Document(
        transaction_id=transaction_id,
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


async def get_documents(
    db: AsyncSession, user_id: int, include_deleted: bool = False
) -> list[Document]:
    query = (
        select(Document)
        .join(Transaction, Document.transaction_id == Transaction.id)
        .join(ProjectItem, Transaction.project_item_id == ProjectItem.id)
        .join(Project, ProjectItem.project_id == Project.id)
        .where(Document.user_id == user_id)
        .order_by(Document.stored_filename)
    )

    if not include_deleted:
        query = query.where(
            Document.deleted_at.is_(None),
            Transaction.deleted_at.is_(None),
            ProjectItem.deleted_at.is_(None),
            Project.deleted_at.is_(None),
        )

    result = await db.execute(query)
    return list(result.scalars().all())


async def get_document_by_id(
    db: AsyncSession, document_id: int, user_id: int
) -> Document | None:
    result = await db.execute(
        select(Document)
        .join(Transaction, Document.transaction_id == Transaction.id)
        .join(ProjectItem, Transaction.project_item_id == ProjectItem.id)
        .join(Project, ProjectItem.project_id == Project.id)
        .where(
            Document.id == document_id,
            Document.user_id == user_id,
            Document.deleted_at.is_(None),
            Transaction.deleted_at.is_(None),
            ProjectItem.deleted_at.is_(None),
            Project.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_documents_by_transaction_id(
    db: AsyncSession, transaction_id: int, user_id: int, include_deleted: bool = False
) -> list[Document]:
    query = (
        select(Document)
        .join(Transaction, Document.transaction_id == Transaction.id)
        .join(ProjectItem, Transaction.project_item_id == ProjectItem.id)
        .join(Project, ProjectItem.project_id == Project.id)
        .where(
            Document.transaction_id == transaction_id,
            Document.user_id == user_id,
        )
        .order_by(Document.created_at.desc())
    )

    if not include_deleted:
        query = query.where(
            Document.deleted_at.is_(None),
            Transaction.deleted_at.is_(None),
            ProjectItem.deleted_at.is_(None),
            Project.deleted_at.is_(None),
        )

    result = await db.execute(query)
    return list(result.scalars().all())


async def soft_delete_document(
    db: AsyncSession, document_id: int, user_id: int
) -> Document | None:
    document = await get_document_by_id(db, document_id, user_id)

    if document is None:
        return None

    document.deleted_at = datetime.now(UTC).replace(tzinfo=None)

    await db.commit()
    await db.refresh(document)

    return document
