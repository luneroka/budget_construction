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
from app.models.supplier_document import SupplierDocument
from app.models.transaction import Transaction

DeletedTransactionRow = Row[tuple[Transaction, str | None, str]]
DeletedDocumentRow = Row[tuple[Document, Transaction, str | None]]
DeletedSupplierRow = Row[tuple[Supplier, int]]
DeletedSupplierDocumentRow = Row[tuple[SupplierDocument, Supplier]]


class TrashRestoreError(ValueError):
    pass


class TrashPermanentDeleteTargets:
    def __init__(
        self,
        *,
        transactions: list[Transaction] | None = None,
        documents: list[Document] | None = None,
        suppliers: list[Supplier] | None = None,
        supplier_documents: list[SupplierDocument] | None = None,
    ) -> None:
        self.transactions = transactions or []
        self.documents = documents or []
        self.suppliers = suppliers or []
        self.supplier_documents = supplier_documents or []


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
        select(
            Supplier,
            func.count(Transaction.id)
            .filter(
                Project.id == project_id,
                Project.user_id == user_id,
                Project.deleted_at.is_(None),
                BudgetLine.deleted_at.is_(None),
            )
            .label('linked_transaction_count'),
        )
        .outerjoin(Transaction, Transaction.supplier_id == Supplier.id)
        .outerjoin(BudgetLine, Transaction.budget_line_id == BudgetLine.id)
        .outerjoin(Project, BudgetLine.project_id == Project.id)
        .where(
            Supplier.user_id == user_id,
            Supplier.deleted_at.is_not(None),
        )
        .group_by(Supplier.id)
        .order_by(Supplier.deleted_at.desc(), Supplier.id.desc())
    )
    return list(result.all())


async def get_deleted_supplier_documents(
    db: AsyncSession,
    user_id: int,
) -> Sequence[DeletedSupplierDocumentRow]:
    result = await db.execute(
        select(SupplierDocument, Supplier)
        .join(Supplier, SupplierDocument.supplier_id == Supplier.id)
        .where(
            SupplierDocument.user_id == user_id,
            SupplierDocument.deleted_at.is_not(None),
        )
        .order_by(SupplierDocument.deleted_at.desc(), SupplierDocument.id.desc())
    )
    return cast(Sequence[DeletedSupplierDocumentRow], list(result.all()))


async def restore_transaction(
    db: AsyncSession,
    project_id: int,
    transaction_id: int,
    user_id: int,
) -> Transaction | None:
    result = await db.execute(
        select(Transaction)
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
        .where(
            Supplier.id == supplier_id,
            Supplier.user_id == user_id,
            Supplier.deleted_at.is_not(None),
        )
    )
    supplier = result.scalar_one_or_none()
    if supplier is None:
        return None

    restored_at = datetime.now(UTC).replace(tzinfo=None)
    try:
        await db.execute(
            update(SupplierDocument)
            .where(
                SupplierDocument.supplier_id == supplier.id,
                SupplierDocument.deleted_at.is_not(None),
            )
            .values(deleted_at=None, updated_at=restored_at)
        )
        supplier.deleted_at = None
        supplier.updated_at = restored_at
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    restored_result = await db.execute(
        select(Supplier)
        .options(selectinload(Supplier.contacts))
        .where(Supplier.id == supplier.id)
    )
    return restored_result.scalar_one()


async def restore_supplier_document(
    db: AsyncSession,
    document_id: int,
    user_id: int,
) -> SupplierDocument | None:
    result = await db.execute(
        select(SupplierDocument, Supplier)
        .join(Supplier, SupplierDocument.supplier_id == Supplier.id)
        .where(
            SupplierDocument.id == document_id,
            SupplierDocument.user_id == user_id,
            SupplierDocument.deleted_at.is_not(None),
        )
    )
    row = result.one_or_none()
    if row is None:
        return None

    document, supplier = row
    if supplier.deleted_at is not None:
        raise TrashRestoreError('Restore the parent supplier first')

    restored_at = datetime.now(UTC).replace(tzinfo=None)
    document.deleted_at = None
    document.updated_at = restored_at

    await db.commit()
    await db.refresh(document)
    return document


async def get_deleted_transaction_for_permanent_delete(
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
    return result.scalar_one_or_none()


async def get_deleted_document_for_permanent_delete(
    db: AsyncSession,
    project_id: int,
    document_id: int,
    user_id: int,
) -> Document | None:
    result = await db.execute(
        select(Document)
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
    return result.scalar_one_or_none()


async def get_deleted_supplier_for_permanent_delete(
    db: AsyncSession,
    project_id: int,
    supplier_id: int,
    user_id: int,
) -> Supplier | None:
    result = await db.execute(
        select(Supplier)
        .options(selectinload(Supplier.contacts), selectinload(Supplier.documents))
        .where(
            Supplier.id == supplier_id,
            Supplier.user_id == user_id,
            Supplier.deleted_at.is_not(None),
        )
    )
    return result.scalar_one_or_none()


async def get_deleted_supplier_document_for_permanent_delete(
    db: AsyncSession,
    document_id: int,
    user_id: int,
) -> SupplierDocument | None:
    result = await db.execute(
        select(SupplierDocument).where(
            SupplierDocument.id == document_id,
            SupplierDocument.user_id == user_id,
            SupplierDocument.deleted_at.is_not(None),
        )
    )
    return result.scalar_one_or_none()


async def get_project_permanent_delete_targets(
    db: AsyncSession,
    project_id: int,
    user_id: int,
) -> TrashPermanentDeleteTargets:
    transaction_result = await db.execute(
        select(Transaction)
        .options(selectinload(Transaction.documents))
        .join(BudgetLine, Transaction.budget_line_id == BudgetLine.id)
        .join(Project, BudgetLine.project_id == Project.id)
        .where(
            BudgetLine.project_id == project_id,
            BudgetLine.deleted_at.is_(None),
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
            Transaction.deleted_at.is_not(None),
        )
    )
    transactions = list(transaction_result.scalars().unique().all())
    transaction_ids = {transaction.id for transaction in transactions}

    document_result = await db.execute(
        select(Document)
        .join(Transaction, Document.transaction_id == Transaction.id)
        .join(BudgetLine, Transaction.budget_line_id == BudgetLine.id)
        .join(Project, BudgetLine.project_id == Project.id)
        .where(
            Document.user_id == user_id,
            Document.deleted_at.is_not(None),
            BudgetLine.project_id == project_id,
            BudgetLine.deleted_at.is_(None),
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )
    documents = [
        document
        for document in document_result.scalars().all()
        if document.transaction_id not in transaction_ids
    ]

    supplier_result = await db.execute(
        select(Supplier)
        .options(selectinload(Supplier.contacts), selectinload(Supplier.documents))
        .where(
            Supplier.user_id == user_id,
            Supplier.deleted_at.is_not(None),
        )
    )
    suppliers = list(supplier_result.scalars().unique().all())
    supplier_ids = {supplier.id for supplier in suppliers}

    supplier_document_result = await db.execute(
        select(SupplierDocument).where(
            SupplierDocument.user_id == user_id,
            SupplierDocument.deleted_at.is_not(None),
        )
    )
    supplier_documents = [
        document
        for document in supplier_document_result.scalars().all()
        if document.supplier_id not in supplier_ids
    ]

    return TrashPermanentDeleteTargets(
        transactions=transactions,
        documents=documents,
        suppliers=suppliers,
        supplier_documents=supplier_documents,
    )


async def permanently_delete_targets(
    db: AsyncSession,
    targets: TrashPermanentDeleteTargets,
) -> None:
    try:
        transaction_ids = [transaction.id for transaction in targets.transactions]
        if transaction_ids:
            await db.execute(
                update(BudgetLine)
                .where(BudgetLine.selected_quote_transaction_id.in_(transaction_ids))
                .values(selected_quote_transaction_id=None)
            )
            await db.execute(
                update(BudgetLine)
                .where(
                    BudgetLine.selected_diy_estimate_transaction_id.in_(transaction_ids)
                )
                .values(selected_diy_estimate_transaction_id=None)
            )

        supplier_ids = [supplier.id for supplier in targets.suppliers]
        if supplier_ids:
            await db.execute(
                update(Transaction)
                .where(Transaction.supplier_id.in_(supplier_ids))
                .values(supplier_id=None)
            )

        for document in targets.documents:
            await db.delete(document)

        for supplier_document in targets.supplier_documents:
            await db.delete(supplier_document)

        for transaction in targets.transactions:
            await db.delete(transaction)

        for supplier in targets.suppliers:
            await db.delete(supplier)

        await db.commit()
    except Exception:
        await db.rollback()
        raise


async def permanently_delete_transaction(
    db: AsyncSession,
    transaction: Transaction,
) -> None:
    await permanently_delete_targets(
        db,
        TrashPermanentDeleteTargets(transactions=[transaction]),
    )


async def permanently_delete_document(db: AsyncSession, document: Document) -> None:
    await permanently_delete_targets(
        db,
        TrashPermanentDeleteTargets(documents=[document]),
    )


async def permanently_delete_supplier(db: AsyncSession, supplier: Supplier) -> None:
    await permanently_delete_targets(
        db,
        TrashPermanentDeleteTargets(suppliers=[supplier]),
    )


async def permanently_delete_supplier_document(
    db: AsyncSession, supplier_document: SupplierDocument
) -> None:
    await permanently_delete_targets(
        db,
        TrashPermanentDeleteTargets(supplier_documents=[supplier_document]),
    )
