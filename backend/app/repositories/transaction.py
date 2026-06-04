from datetime import UTC, datetime
from typing import cast

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.project import Project
from app.models.project_item import ProjectItem
from app.models.supplier import Supplier
from app.models.transaction import (
    InvoiceStatus,
    QuoteStatus,
    Transaction,
    TransactionType,
)
from app.schemas.transaction import TransactionCreate, TransactionUpdate


class TransactionValidationError(ValueError):
    pass


def _apply_create_defaults(transaction_data: TransactionCreate) -> dict[str, object]:
    values: dict[str, object] = transaction_data.model_dump()

    if values['transaction_type'] == TransactionType.quote:
        values['quote_status'] = values['quote_status'] or QuoteStatus.to_confirm

    if values['transaction_type'] == TransactionType.invoice:
        values['invoice_status'] = values['invoice_status'] or InvoiceStatus.unpaid

    return values


async def _get_active_project_item(
    db: AsyncSession,
    project_id: int,
    project_item_id: int,
    user_id: int,
) -> ProjectItem | None:
    result = await db.execute(
        select(ProjectItem)
        .join(Project, ProjectItem.project_id == Project.id)
        .where(
            ProjectItem.id == project_item_id,
            ProjectItem.project_id == project_id,
            ProjectItem.deleted_at.is_(None),
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )

    return result.scalar_one_or_none()


async def _validate_supplier(
    db: AsyncSession,
    supplier_id: int | None,
    user_id: int,
) -> None:
    if supplier_id is None:
        return

    result = await db.execute(
        select(Supplier.id).where(
            Supplier.id == supplier_id,
            Supplier.user_id == user_id,
            Supplier.deleted_at.is_(None),
        )
    )
    if result.scalar_one_or_none() is None:
        raise TransactionValidationError('Supplier not found')


def _validate_update(
    transaction: Transaction,
    transaction_data: TransactionUpdate,
) -> dict[str, object]:
    values: dict[str, object] = transaction_data.model_dump(exclude_unset=True)

    if (
        transaction.transaction_type != TransactionType.quote
        and values.get('quote_status') is not None
    ):
        raise TransactionValidationError(
            'quote_status is only allowed for quote transactions'
        )

    if (
        transaction.transaction_type != TransactionType.invoice
        and values.get('invoice_status') is not None
    ):
        raise TransactionValidationError(
            'invoice_status is only allowed for invoice transactions'
        )

    if (
        transaction.transaction_type != TransactionType.invoice
        and values.get('payment_method') is not None
    ):
        raise TransactionValidationError(
            'payment_method is only allowed for invoice transactions'
        )

    if (
        transaction.transaction_type == TransactionType.invoice
        and values.get('is_selected_budget') is True
    ):
        raise TransactionValidationError(
            'Invoices cannot be selected as budget candidates'
        )

    return values


async def _clear_selected_budget_candidate(
    db: AsyncSession,
    project_item_id: int,
) -> None:
    await db.execute(
        update(Transaction)
        .where(
            Transaction.project_item_id == project_item_id,
            Transaction.deleted_at.is_(None),
        )
        .values(is_selected_budget=False)
    )


async def create_transaction(
    db: AsyncSession,
    project_id: int,
    project_item_id: int,
    transaction_data: TransactionCreate,
    user_id: int,
) -> Transaction | None:
    if await _get_active_project_item(db, project_id, project_item_id, user_id) is None:
        return None

    await _validate_supplier(db, transaction_data.supplier_id, user_id)

    values = _apply_create_defaults(transaction_data)
    if (
        values['transaction_type'] == TransactionType.invoice
        and values['is_selected_budget']
    ):
        raise TransactionValidationError(
            'Invoices cannot be selected as budget candidates'
        )
    if values['is_selected_budget']:
        await _clear_selected_budget_candidate(db, project_item_id)

    transaction = Transaction(**values, project_item_id=project_item_id)
    db.add(transaction)
    await db.commit()

    return await get_transaction_by_id(
        db,
        project_id,
        project_item_id,
        transaction.id,
        user_id,
    )


async def get_transaction_by_id(
    db: AsyncSession,
    project_id: int,
    project_item_id: int,
    transaction_id: int,
    user_id: int,
) -> Transaction | None:
    result = await db.execute(
        select(Transaction)
        .join(ProjectItem, Transaction.project_item_id == ProjectItem.id)
        .join(Project, ProjectItem.project_id == Project.id)
        .where(
            Transaction.id == transaction_id,
            Transaction.project_item_id == project_item_id,
            Transaction.deleted_at.is_(None),
            ProjectItem.project_id == project_id,
            ProjectItem.deleted_at.is_(None),
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )

    return result.scalar_one_or_none()


async def get_transactions_by_project_item(
    db: AsyncSession,
    project_id: int,
    project_item_id: int,
    user_id: int,
) -> list[Transaction] | None:
    if await _get_active_project_item(db, project_id, project_item_id, user_id) is None:
        return None

    result = await db.execute(
        select(Transaction)
        .where(
            Transaction.project_item_id == project_item_id,
            Transaction.deleted_at.is_(None),
        )
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
    )

    return list(result.scalars().all())


async def update_transaction(
    db: AsyncSession,
    project_id: int,
    project_item_id: int,
    transaction_id: int,
    transaction_data: TransactionUpdate,
    user_id: int,
) -> Transaction | None:
    transaction = await get_transaction_by_id(
        db,
        project_id,
        project_item_id,
        transaction_id,
        user_id,
    )
    if transaction is None:
        return None

    values = _validate_update(transaction, transaction_data)
    if 'supplier_id' in values:
        await _validate_supplier(
            db,
            cast(int | None, values['supplier_id']),
            user_id,
        )
    if values.get('is_selected_budget') is True:
        await _clear_selected_budget_candidate(db, project_item_id)

    for field, value in values.items():
        setattr(transaction, field, value)

    await db.commit()
    await db.refresh(transaction)

    return transaction


async def soft_delete_transaction(
    db: AsyncSession,
    project_id: int,
    project_item_id: int,
    transaction_id: int,
    user_id: int,
) -> Transaction | None:
    transaction = await get_transaction_by_id(
        db,
        project_id,
        project_item_id,
        transaction_id,
        user_id,
    )
    if transaction is None:
        return None

    deleted_at = datetime.now(UTC).replace(tzinfo=None)
    try:
        await db.execute(
            update(Document)
            .where(
                Document.transaction_id == transaction.id,
                Document.deleted_at.is_(None),
            )
            .values(deleted_at=deleted_at, updated_at=deleted_at)
        )
        transaction.deleted_at = deleted_at

        await db.commit()
        await db.refresh(transaction)
    except Exception:
        await db.rollback()
        raise

    return transaction


async def select_budget_candidate(
    db: AsyncSession,
    project_id: int,
    project_item_id: int,
    transaction_id: int,
    user_id: int,
) -> Transaction | None:
    transaction = await get_transaction_by_id(
        db,
        project_id,
        project_item_id,
        transaction_id,
        user_id,
    )
    if transaction is None:
        return None

    if transaction.transaction_type not in {
        TransactionType.quote,
        TransactionType.diy_estimate,
    }:
        raise TransactionValidationError(
            'Only quotes and DIY estimates can be selected as budget candidates'
        )

    await _clear_selected_budget_candidate(db, transaction.project_item_id)
    transaction.is_selected_budget = True

    await db.commit()
    await db.refresh(transaction)

    return transaction


async def get_transaction_by_id_for_user(
    db: AsyncSession, transaction_id: int, user_id: int
) -> Transaction | None:
    result = await db.execute(
        select(Transaction)
        .join(ProjectItem, Transaction.project_item_id == ProjectItem.id)
        .join(Project, ProjectItem.project_id == Project.id)
        .where(
            Transaction.id == transaction_id,
            Transaction.deleted_at.is_(None),
            ProjectItem.deleted_at.is_(None),
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()
