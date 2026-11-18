from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import cast

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy.sql import Select

from app.models.document import Document
from app.models.project import Project
from app.models.supplier import Supplier
from app.models.transaction import (
    API_TRANSACTION_TYPES,
    InvoiceStatus,
    InvoiceType,
    QuoteStatus,
    Transaction,
    TransactionType,
)
from app.schemas.transaction import (
    TransactionCreate,
    TransactionUpdate,
)
from app.core.time import utcnow
from app.repositories import lot as lot_repository
from app.repositories.common import get_active_project


class TransactionValidationError(ValueError):
    pass


MONEY_QUANT = Decimal('0.01')
VAT_RATE_DIVISOR = Decimal('100')
AMOUNT_TOLERANCE = Decimal('0.01')


def _as_decimal(value: object) -> Decimal:
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception as error:
        raise TransactionValidationError('Amounts must be decimal numbers') from error


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _amounts_differ(left: Decimal, right: Decimal) -> bool:
    return abs(_money(left) - _money(right)) > AMOUNT_TOLERANCE


def normalize_transaction_amounts(values: dict[str, object]) -> None:
    amount_ht = _money(_as_decimal(values['amount_ht']))
    amount_vat_value = values.get('amount_vat')
    amount_ttc_value = values.get('amount_ttc')
    vat_rate_value = values.get('vat_rate')

    if amount_ht < 0:
        raise TransactionValidationError('amount_ht must be greater than or equal to 0')

    vat_rate: Decimal | None = None
    if vat_rate_value is not None:
        vat_rate = _as_decimal(vat_rate_value)
        if vat_rate < 0:
            raise TransactionValidationError(
                'vat_rate must be greater than or equal to 0'
            )

    amount_ttc: Decimal | None = None
    if amount_ttc_value is not None:
        amount_ttc = _money(_as_decimal(amount_ttc_value))
        if amount_ttc < 0:
            raise TransactionValidationError(
                'amount_ttc must be greater than or equal to 0'
            )

    if amount_vat_value is None:
        if vat_rate is not None:
            amount_vat = _money(amount_ht * vat_rate / VAT_RATE_DIVISOR)
        elif amount_ttc is not None:
            amount_vat = _money(amount_ttc - amount_ht)
        else:
            raise TransactionValidationError(
                'amount_ttc is required when vat_rate and amount_vat are not provided'
            )
    else:
        amount_vat = _money(_as_decimal(amount_vat_value))

    if amount_vat < 0:
        raise TransactionValidationError(
            'amount_vat must be greater than or equal to 0'
        )

    if vat_rate is not None and amount_vat_value is not None:
        expected_amount_vat = _money(amount_ht * vat_rate / VAT_RATE_DIVISOR)
        if _amounts_differ(amount_vat, expected_amount_vat):
            raise TransactionValidationError(
                'amount_vat does not match amount_ht and vat_rate'
            )

    expected_amount_ttc = _money(amount_ht + amount_vat)
    if amount_ttc is None:
        amount_ttc = expected_amount_ttc
    elif _amounts_differ(amount_ttc, expected_amount_ttc):
        raise TransactionValidationError(
            'amount_ttc does not match amount_ht and amount_vat'
        )

    values['amount_ht'] = amount_ht
    values['amount_vat'] = amount_vat
    values['amount_ttc'] = amount_ttc
    if vat_rate is not None:
        values['vat_rate'] = vat_rate


def validate_transaction_lifecycle(values: dict[str, object]) -> None:
    transaction_type = cast(TransactionType, values['transaction_type'])
    quote_status = cast(QuoteStatus | None, values.get('quote_status'))
    invoice_status = cast(InvoiceStatus | None, values.get('invoice_status'))
    invoice_type = cast(InvoiceType | None, values.get('invoice_type'))
    payment_date = values.get('payment_date')

    if transaction_type == TransactionType.quote:
        if quote_status is None:
            raise TransactionValidationError('quote_status is required for quotes')
        return

    if transaction_type != TransactionType.invoice:
        return

    if invoice_status is None:
        raise TransactionValidationError('invoice_status is required for invoices')

    if invoice_type is None:
        raise TransactionValidationError('invoice_type is required for invoices')

    if invoice_status == InvoiceStatus.paid:
        if payment_date is None:
            raise TransactionValidationError(
                'payment_date is required for paid invoices'
            )
        return

    if payment_date is not None:
        raise TransactionValidationError(
            'payment_date is only allowed when invoice_status is paid'
        )


def validate_transaction_dates(values: dict[str, object]) -> None:
    issued_date = cast(date | None, values.get('issued_date'))
    due_date = cast(date | None, values.get('due_date'))
    payment_date = cast(date | None, values.get('payment_date'))

    if issued_date is None:
        raise TransactionValidationError('issued_date is required')

    if due_date is not None and due_date < issued_date:
        raise TransactionValidationError(
            'due_date must be greater than or equal to issued_date'
        )

    if payment_date is not None and payment_date < issued_date:
        raise TransactionValidationError(
            'payment_date must be greater than or equal to issued_date'
        )


def _apply_create_defaults(transaction_data: TransactionCreate) -> dict[str, object]:
    values: dict[str, object] = transaction_data.model_dump()
    if values['transaction_type'] not in API_TRANSACTION_TYPES:
        raise TransactionValidationError(
            'Only quote and invoice transactions are supported'
        )
    normalize_transaction_amounts(values)

    if values['transaction_type'] == TransactionType.quote:
        values['quote_status'] = values['quote_status'] or QuoteStatus.to_confirm

    if values['transaction_type'] == TransactionType.invoice:
        values['invoice_status'] = values['invoice_status'] or InvoiceStatus.unpaid
        values['invoice_type'] = values['invoice_type'] or InvoiceType.full

    validate_transaction_lifecycle(values)
    validate_transaction_dates(values)

    return values


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
        raise TransactionValidationError('Supplier not found or inactive')


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
        and values.get('invoice_type') is not None
    ):
        raise TransactionValidationError(
            'invoice_type is only allowed for invoice transactions'
        )

    if (
        transaction.transaction_type != TransactionType.invoice
        and values.get('payment_method') is not None
    ):
        raise TransactionValidationError(
            'payment_method is only allowed for invoice transactions'
        )

    if (
        transaction.transaction_type != TransactionType.invoice
        and values.get('payment_date') is not None
    ):
        raise TransactionValidationError(
            'payment_date is only allowed for invoice transactions'
        )

    if {'amount_ht', 'vat_rate', 'amount_vat', 'amount_ttc'} & values.keys():
        amount_values: dict[str, object] = {
            'amount_ht': transaction.amount_ht,
            'vat_rate': transaction.vat_rate,
            'amount_vat': transaction.amount_vat,
            'amount_ttc': transaction.amount_ttc,
        }
        amount_values.update(values)
        if {'amount_ht', 'vat_rate'} & values.keys() and 'amount_vat' not in values:
            amount_values['amount_vat'] = None
        if {
            'amount_ht',
            'vat_rate',
            'amount_vat',
        } & values.keys() and 'amount_ttc' not in values:
            amount_values['amount_ttc'] = None
        normalize_transaction_amounts(amount_values)
        values.update(amount_values)

    lifecycle_values: dict[str, object] = {
        'transaction_type': transaction.transaction_type,
        'quote_status': transaction.quote_status,
        'invoice_status': transaction.invoice_status,
        'invoice_type': transaction.invoice_type,
        'payment_date': transaction.payment_date,
    }
    lifecycle_values.update(values)
    validate_transaction_lifecycle(lifecycle_values)

    date_values: dict[str, object] = {
        'issued_date': transaction.issued_date,
        'due_date': transaction.due_date,
        'payment_date': transaction.payment_date,
    }
    date_values.update(values)
    validate_transaction_dates(date_values)

    return values


def _transaction_query(project_id: int, user_id: int) -> Select[tuple[Transaction]]:
    """Active transactions of the user's active project, reached through
    ``transactions.project_id``: lots are global and prove no ownership."""
    return (
        select(Transaction)
        .options(
            selectinload(Transaction.documents),
            joinedload(Transaction.supplier),
            joinedload(Transaction.lot),
        )
        .join(Project, Transaction.project_id == Project.id)
        .where(
            Transaction.project_id == project_id,
            Transaction.deleted_at.is_(None),
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )


async def create_transaction(
    db: AsyncSession,
    project_id: int,
    transaction_data: TransactionCreate,
    user_id: int,
) -> Transaction | None:
    if await get_active_project(db, project_id, user_id) is None:
        return None

    values = _apply_create_defaults(transaction_data)
    await lot_repository.require_available_lot(db, project_id, transaction_data.lot_id)
    await _validate_supplier(db, transaction_data.supplier_id, user_id)

    transaction = Transaction(**values, project_id=project_id)
    db.add(transaction)
    await lot_repository.ensure_supplier_lot(
        db, project_id, transaction.supplier_id, transaction.lot_id
    )
    await db.commit()

    return await get_transaction_by_id(db, project_id, transaction.id, user_id)


async def get_transaction_by_id(
    db: AsyncSession,
    project_id: int,
    transaction_id: int,
    user_id: int,
) -> Transaction | None:
    result = await db.execute(
        _transaction_query(project_id, user_id)
        .where(Transaction.id == transaction_id)
        .execution_options(populate_existing=True)
    )

    return result.unique().scalar_one_or_none()


async def get_transactions_by_project(
    db: AsyncSession,
    project_id: int,
    user_id: int,
) -> list[Transaction] | None:
    if await get_active_project(db, project_id, user_id) is None:
        return None

    result = await db.execute(
        _transaction_query(project_id, user_id).order_by(
            Transaction.issued_date.desc(), Transaction.id.desc()
        )
    )

    return list(result.unique().scalars().all())


async def update_transaction(
    db: AsyncSession,
    project_id: int,
    transaction_id: int,
    transaction_data: TransactionUpdate,
    user_id: int,
) -> Transaction | None:
    transaction = await get_transaction_by_id(
        db,
        project_id,
        transaction_id,
        user_id,
    )
    if transaction is None:
        return None

    values = _validate_update(transaction, transaction_data)
    if 'lot_id' in values:
        lot_id = values['lot_id']
        if lot_id is None:
            raise TransactionValidationError('Lot not found or hidden in this project')
        if lot_id != transaction.lot_id:
            await lot_repository.require_available_lot(db, project_id, cast(int, lot_id))
    if 'supplier_id' in values:
        await _validate_supplier(
            db,
            cast(int | None, values['supplier_id']),
            user_id,
        )
    for field, value in values.items():
        setattr(transaction, field, value)

    await lot_repository.ensure_supplier_lot(
        db, project_id, transaction.supplier_id, transaction.lot_id
    )
    await db.commit()

    return await get_transaction_by_id(db, project_id, transaction_id, user_id)


async def soft_delete_transaction(
    db: AsyncSession,
    project_id: int,
    transaction_id: int,
    user_id: int,
) -> Transaction | None:
    transaction = await get_transaction_by_id(
        db,
        project_id,
        transaction_id,
        user_id,
    )
    if transaction is None:
        return None

    deleted_at = utcnow()
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


async def get_transaction_by_id_for_user(
    db: AsyncSession, transaction_id: int, user_id: int
) -> Transaction | None:
    result = await db.execute(
        select(Transaction)
        .join(Project, Transaction.project_id == Project.id)
        .where(
            Transaction.id == transaction_id,
            Transaction.deleted_at.is_(None),
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()
