from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import cast

from sqlalchemy import func, select, update
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.budget_line import BudgetLine
from app.models.document import Document
from app.models.product import Product
from app.models.project import Project
from app.models.supplier import Supplier
from app.models.transaction import Transaction

DeletedTransactionRow = Row[tuple[Transaction, str | None, str]]
DeletedDocumentRow = Row[tuple[Document, Transaction, str | None]]
DeletedSupplierRow = Row[tuple[Supplier, int]]


class TrashRestoreError(ValueError):
    pass


async def project_exists_for_user(
    db: AsyncSession,
    project_id: int,
    user_id: int,
) -> bool:
    result = await db.execute(
        select(Project.id).where(
            Project.id == project_id,
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none() is not None


async def get_deleted_transactions(
    db: AsyncSession,
    project_id: int,
    user_id: int,
) -> Sequence[DeletedTransactionRow]:
    result = await db.execute(
        select(Transaction, Supplier.name, Product.name)
        .join(BudgetLine, Transaction.budget_line_id == BudgetLine.id)
        .join(Project, BudgetLine.project_id == Project.id)
        .join(Product, BudgetLine.product_id == Product.id)
        .outerjoin(Supplier, Transaction.supplier_id == Supplier.id)
        .where(
            Project.id == project_id,
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
            BudgetLine.deleted_at.is_(None),
            Transaction.deleted_at.is_not(None),
        )
        .order_by(Transaction.deleted_at.desc(), Transaction.id.desc())
    )
    return cast(Sequence[DeletedTransactionRow], list(result.all()))


async def get_deleted_documents(
    db: AsyncSession,
    project_id: int,
    user_id: int,
) -> Sequence[DeletedDocumentRow]:
    result = await db.execute(
        select(Document, Transaction, Supplier.name)
        .join(Transaction, Document.transaction_id == Transaction.id)
        .join(BudgetLine, Transaction.budget_line_id == BudgetLine.id)
        .join(Project, BudgetLine.project_id == Project.id)
        .outerjoin(Supplier, Transaction.supplier_id == Supplier.id)
        .where(
            Project.id == project_id,
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
            BudgetLine.deleted_at.is_(None),
            Document.user_id == user_id,
            Document.deleted_at.is_not(None),
        )
        .order_by(Document.deleted_at.desc(), Document.id.desc())
    )
    return cast(Sequence[DeletedDocumentRow], list(result.all()))


async def get_deleted_suppliers(
    db: AsyncSession,
    project_id: int,
    user_id: int,
) -> Sequence[DeletedSupplierRow]:
    result = await db.execute(
        select(Supplier, func.count(Transaction.id))
        .join(Transaction, Transaction.supplier_id == Supplier.id)
        .join(BudgetLine, Transaction.budget_line_id == BudgetLine.id)
        .join(Project, BudgetLine.project_id == Project.id)
        .where(
            Project.id == project_id,
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
            BudgetLine.deleted_at.is_(None),
            Supplier.user_id == user_id,
            Supplier.deleted_at.is_not(None),
        )
        .group_by(Supplier.id)
        .order_by(Supplier.deleted_at.desc(), Supplier.id.desc())
    )
    return list(result.all())


async def restore_transaction(
    db: AsyncSession,
    project_id: int,
    transaction_id: int,
    user_id: int,
) -> Transaction | None:
    result = await db.execute(
        select(Transaction)
        .options(selectinload(Transaction.documents))
        .join(BudgetLine, Transaction.budget_line_id == BudgetLine.id)
        .join(Project, BudgetLine.project_id == Project.id)
        .where(
            Transaction.id == transaction_id,
            Transaction.deleted_at.is_not(None),
            BudgetLine.project_id == project_id,
            BudgetLine.deleted_at.is_(None),
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )
    transaction = result.scalar_one_or_none()
    if transaction is None:
        return None

    restored_at = datetime.now(UTC).replace(tzinfo=None)
    try:
        await db.execute(
            update(Document)
            .where(
                Document.transaction_id == transaction.id,
                Document.deleted_at.is_not(None),
            )
            .values(deleted_at=None, updated_at=restored_at)
        )
        transaction.deleted_at = None
        transaction.updated_at = restored_at
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    restored_result = await db.execute(
        select(Transaction)
        .options(selectinload(Transaction.documents))
        .where(Transaction.id == transaction.id)
    )
    return restored_result.scalar_one()


async def restore_document(
    db: AsyncSession,
    project_id: int,
    document_id: int,
    user_id: int,
) -> Document | None:
    result = await db.execute(
        select(Document, Transaction)
        .join(Transaction, Document.transaction_id == Transaction.id)
        .join(BudgetLine, Transaction.budget_line_id == BudgetLine.id)
        .join(Project, BudgetLine.project_id == Project.id)
        .where(
            Document.id == document_id,
            Document.user_id == user_id,
            Document.deleted_at.is_not(None),
            BudgetLine.project_id == project_id,
            BudgetLine.deleted_at.is_(None),
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )
    row = result.one_or_none()
    if row is None:
        return None

    document, transaction = row
    if transaction.deleted_at is not None:
        raise TrashRestoreError('Restore the parent transaction first')

    restored_at = datetime.now(UTC).replace(tzinfo=None)
    document.deleted_at = None
    document.updated_at = restored_at

    await db.commit()
    await db.refresh(document)
    return document


async def restore_supplier(
    db: AsyncSession,
    project_id: int,
    supplier_id: int,
    user_id: int,
) -> Supplier | None:
    result = await db.execute(
        select(Supplier)
        .options(selectinload(Supplier.contacts))
        .join(Transaction, Transaction.supplier_id == Supplier.id)
        .join(BudgetLine, Transaction.budget_line_id == BudgetLine.id)
        .join(Project, BudgetLine.project_id == Project.id)
        .where(
            Supplier.id == supplier_id,
            Supplier.user_id == user_id,
            Supplier.deleted_at.is_not(None),
            BudgetLine.project_id == project_id,
            BudgetLine.deleted_at.is_(None),
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
        .group_by(Supplier.id)
    )
    supplier = result.scalar_one_or_none()
    if supplier is None:
        return None

    restored_at = datetime.now(UTC).replace(tzinfo=None)
    supplier.deleted_at = None
    supplier.updated_at = restored_at
    await db.commit()
    await db.refresh(supplier)
    return supplier
