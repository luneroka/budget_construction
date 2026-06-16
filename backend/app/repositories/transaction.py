from datetime import UTC, date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import cast

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.project import Project
from app.models.budget_line import BudgetLine
from app.models.supplier import Supplier
from app.models.transaction import (
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


class TransactionValidationError(ValueError):
    pass


MONEY_QUANT = Decimal('0.01')
VAT_RATE_DIVISOR = Decimal('100')
AMOUNT_TOLERANCE = Decimal('0.01')


def _as_decimal(value: object, field_name: str) -> Decimal:
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception as error:
        raise TransactionValidationError(f'{field_name} must be a decimal') from error


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _amounts_differ(left: Decimal, right: Decimal) -> bool:
    return abs(_money(left) - _money(right)) > AMOUNT_TOLERANCE


def normalize_transaction_amounts(values: dict[str, object]) -> None:
    amount_ht = _money(_as_decimal(values['amount_ht'], 'amount_ht'))
    amount_vat_value = values.get('amount_vat')
    amount_ttc_value = values.get('amount_ttc')
    vat_rate_value = values.get('vat_rate')

    if amount_ht < 0:
        raise TransactionValidationError('amount_ht must be greater than or equal to 0')

    vat_rate: Decimal | None = None
    if vat_rate_value is not None:
        vat_rate = _as_decimal(vat_rate_value, 'vat_rate')
        if vat_rate < 0:
            raise TransactionValidationError(
                'vat_rate must be greater than or equal to 0'
            )

    amount_ttc: Decimal | None = None
    if amount_ttc_value is not None:
        amount_ttc = _money(_as_decimal(amount_ttc_value, 'amount_ttc'))
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
        amount_vat = _money(_as_decimal(amount_vat_value, 'amount_vat'))

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


def _validate_transaction_dates(values: dict[str, object]) -> None:
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
    values: dict[str, object] = transaction_data.model_dump(
        exclude={'select_as_budget'}
    )
    normalize_transaction_amounts(values)

    if values['transaction_type'] == TransactionType.quote:
        values['quote_status'] = values['quote_status'] or QuoteStatus.to_confirm

    if values['transaction_type'] == TransactionType.invoice:
        values['invoice_status'] = values['invoice_status'] or InvoiceStatus.unpaid
        values['invoice_type'] = values['invoice_type'] or InvoiceType.full

    validate_transaction_lifecycle(values)
    _validate_transaction_dates(values)

    return values


async def _get_active_budget_line(
    db: AsyncSession,
    project_id: int,
    budget_line_id: int,
    user_id: int,
) -> BudgetLine | None:
    result = await db.execute(
        select(BudgetLine)
        .join(Project, BudgetLine.project_id == Project.id)
        .where(
            BudgetLine.id == budget_line_id,
            BudgetLine.project_id == project_id,
            BudgetLine.deleted_at.is_(None),
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
        transaction.transaction_type
        not in {TransactionType.quote, TransactionType.invoice}
        and values.get('due_date') is not None
    ):
        raise TransactionValidationError(
            'due_date is only allowed for quote and invoice transactions'
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
    _validate_transaction_dates(date_values)

    return values


def validate_selected_budget_candidate(
    transaction_type: TransactionType,
    quote_status: QuoteStatus | None,
) -> None:
    if transaction_type not in {
        TransactionType.quote,
        TransactionType.diy_estimate,
    }:
        raise TransactionValidationError(
            'Only quotes and DIY estimates can be selected as budget candidates'
        )
    if (
        transaction_type == TransactionType.quote
        and quote_status != QuoteStatus.validated
    ):
        raise TransactionValidationError(
            'Only validated quotes can be selected as budget candidates'
        )


async def _set_selected_budget_candidate(
    db: AsyncSession,
    budget_line_id: int,
    transaction_id: int | None,
) -> None:
    await db.execute(
        update(BudgetLine)
        .where(BudgetLine.id == budget_line_id)
        .values(selected_budget_transaction_id=transaction_id)
    )


async def _clear_selected_budget_candidate_if_matches(
    db: AsyncSession,
    budget_line_id: int,
    transaction_id: int,
) -> None:
    await db.execute(
        update(BudgetLine)
        .where(
            BudgetLine.id == budget_line_id,
            BudgetLine.selected_budget_transaction_id == transaction_id,
        )
        .values(selected_budget_transaction_id=None)
    )


async def _ensure_selected_budget_candidate_remains_valid(
    db: AsyncSession,
    transaction: Transaction,
    values: dict[str, object],
) -> None:
    if transaction.transaction_type != TransactionType.quote:
        return

    quote_status = cast(
        QuoteStatus | None,
        values.get('quote_status', transaction.quote_status),
    )
    if quote_status == QuoteStatus.validated:
        return

    result = await db.execute(
        select(BudgetLine.id).where(
            BudgetLine.selected_budget_transaction_id == transaction.id,
            BudgetLine.deleted_at.is_(None),
        )
    )
    if result.scalar_one_or_none() is not None:
        raise TransactionValidationError(
            'A selected budget quote must remain validated'
        )


async def create_transaction(
    db: AsyncSession,
    project_id: int,
    budget_line_id: int,
    transaction_data: TransactionCreate,
    user_id: int,
) -> Transaction | None:
    if await _get_active_budget_line(db, project_id, budget_line_id, user_id) is None:
        return None

    await _validate_supplier(db, transaction_data.supplier_id, user_id)

    values = _apply_create_defaults(transaction_data)
    if transaction_data.select_as_budget:
        validate_selected_budget_candidate(
            cast(TransactionType, values['transaction_type']),
            cast(QuoteStatus | None, values.get('quote_status')),
        )

    transaction = Transaction(**values, budget_line_id=budget_line_id)
    db.add(transaction)
    await db.flush()
    if transaction_data.select_as_budget:
        await _set_selected_budget_candidate(db, budget_line_id, transaction.id)
    await db.commit()

    return await get_transaction_by_id(
        db,
        project_id,
        budget_line_id,
        transaction.id,
        user_id,
    )


async def get_transaction_by_id(
    db: AsyncSession,
    project_id: int,
    budget_line_id: int,
    transaction_id: int,
    user_id: int,
) -> Transaction | None:
    result = await db.execute(
        select(Transaction)
        .join(BudgetLine, Transaction.budget_line_id == BudgetLine.id)
        .join(Project, BudgetLine.project_id == Project.id)
        .where(
            Transaction.id == transaction_id,
            Transaction.budget_line_id == budget_line_id,
            Transaction.deleted_at.is_(None),
            BudgetLine.project_id == project_id,
            BudgetLine.deleted_at.is_(None),
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )

    return result.scalar_one_or_none()


async def get_transactions_by_budget_line(
    db: AsyncSession,
    project_id: int,
    budget_line_id: int,
    user_id: int,
) -> list[Transaction] | None:
    if await _get_active_budget_line(db, project_id, budget_line_id, user_id) is None:
        return None

    result = await db.execute(
        select(Transaction)
        .where(
            Transaction.budget_line_id == budget_line_id,
            Transaction.deleted_at.is_(None),
        )
        .order_by(Transaction.issued_date.desc(), Transaction.id.desc())
    )

    return list(result.scalars().all())


async def update_transaction(
    db: AsyncSession,
    project_id: int,
    budget_line_id: int,
    transaction_id: int,
    transaction_data: TransactionUpdate,
    user_id: int,
) -> Transaction | None:
    transaction = await get_transaction_by_id(
        db,
        project_id,
        budget_line_id,
        transaction_id,
        user_id,
    )
    if transaction is None:
        return None

    values = _validate_update(transaction, transaction_data)
    await _ensure_selected_budget_candidate_remains_valid(db, transaction, values)
    if 'supplier_id' in values:
        await _validate_supplier(
            db,
            cast(int | None, values['supplier_id']),
            user_id,
        )
    for field, value in values.items():
        setattr(transaction, field, value)

    await db.commit()
    await db.refresh(transaction)

    return transaction


async def soft_delete_transaction(
    db: AsyncSession,
    project_id: int,
    budget_line_id: int,
    transaction_id: int,
    user_id: int,
) -> Transaction | None:
    transaction = await get_transaction_by_id(
        db,
        project_id,
        budget_line_id,
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
        await _clear_selected_budget_candidate_if_matches(
            db,
            transaction.budget_line_id,
            transaction.id,
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
    budget_line_id: int,
    transaction_id: int,
    user_id: int,
) -> Transaction | None:
    transaction = await get_transaction_by_id(
        db,
        project_id,
        budget_line_id,
        transaction_id,
        user_id,
    )
    if transaction is None:
        return None

    validate_selected_budget_candidate(
        transaction.transaction_type,
        transaction.quote_status,
    )
    await _set_selected_budget_candidate(db, transaction.budget_line_id, transaction.id)

    await db.commit()
    await db.refresh(transaction)

    return transaction


async def get_transaction_by_id_for_user(
    db: AsyncSession, transaction_id: int, user_id: int
) -> Transaction | None:
    result = await db.execute(
        select(Transaction)
        .join(BudgetLine, Transaction.budget_line_id == BudgetLine.id)
        .join(Project, BudgetLine.project_id == Project.id)
        .where(
            Transaction.id == transaction_id,
            Transaction.deleted_at.is_(None),
            BudgetLine.deleted_at.is_(None),
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()
