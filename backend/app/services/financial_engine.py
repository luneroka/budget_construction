from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload, with_loader_criteria

from app.models.document import Document
from app.models.lot import Lot
from app.models.transaction import (
    InvoiceStatus,
    QuoteStatus,
    Transaction,
    TransactionType,
)
from app.repositories.common import get_active_project
from app.repositories.lot import get_visible_lots
from app.schemas.financial_engine import (
    DashboardFinancialOverviewRead,
    DashboardLotInvoicedRead,
    DashboardSpendingOverTimePointRead,
    DashboardSupplierDistributionRead,
    DashboardTransactionWidgetItemRead,
    DashboardTransactionWidgetRead,
    FinancialTotalsRead,
    LotFinancialSummaryRead,
    LotSupplierFinancialSummaryRead,
    ProjectFinancialSummaryRead,
    SupplierFinancialSummaryRead,
)
from app.core.time import utcnow

ZERO_MONEY = Decimal('0.00')
DASHBOARD_WIDGET_LIMIT = 5
NO_SUPPLIER_LABEL = 'Sans fournisseur'


@dataclass
class FinancialTotals:
    """The money figures of a supplier group, a lot, a supplier or a project.

    - Coût prévu: per supplier and per lot, the larger of its active
      ``validated`` quotes and its active invoices (« Sans fournisseur » is
      one group); a lot, a supplier or the project adds up those maxes.
    - Facturé: TTC of every active invoice, split paid / unpaid / on hold.
    - À payer: the unpaid and on-hold invoices, so Payé + À payer = Facturé.
    - The validated quotes stay as a reference figure.
    """

    planned_cost_ttc: Decimal = ZERO_MONEY
    validated_quote_amount_ttc: Decimal = ZERO_MONEY
    invoiced_amount_ttc: Decimal = ZERO_MONEY
    paid_invoice_amount_ttc: Decimal = ZERO_MONEY
    unpaid_invoice_amount_ttc: Decimal = ZERO_MONEY
    on_hold_invoice_amount_ttc: Decimal = ZERO_MONEY
    quote_count: int = 0
    validated_quote_count: int = 0
    invoice_count: int = 0

    @property
    def to_pay_amount_ttc(self) -> Decimal:
        return self.unpaid_invoice_amount_ttc + self.on_hold_invoice_amount_ttc

    def add_transaction(self, transaction: Transaction) -> None:
        """Count one transaction of a single supplier group in a single lot,
        and keep that group's Coût prévu at its max."""
        amount = transaction.amount_ttc

        if transaction.transaction_type == TransactionType.quote:
            self.quote_count += 1
            if transaction.quote_status == QuoteStatus.validated:
                self.validated_quote_amount_ttc += amount
                self.validated_quote_count += 1
        elif transaction.transaction_type == TransactionType.invoice:
            self.invoice_count += 1
            self.invoiced_amount_ttc += amount
            if transaction.invoice_status == InvoiceStatus.paid:
                self.paid_invoice_amount_ttc += amount
            elif transaction.invoice_status == InvoiceStatus.unpaid:
                self.unpaid_invoice_amount_ttc += amount
            elif transaction.invoice_status == InvoiceStatus.on_hold:
                self.on_hold_invoice_amount_ttc += amount

        self.planned_cost_ttc = max(
            self.validated_quote_amount_ttc, self.invoiced_amount_ttc
        )

    def merge(self, other: FinancialTotals) -> None:
        """Add another group's figures: Coût prévu adds the groups' maxes."""
        self.planned_cost_ttc += other.planned_cost_ttc
        self.validated_quote_amount_ttc += other.validated_quote_amount_ttc
        self.invoiced_amount_ttc += other.invoiced_amount_ttc
        self.paid_invoice_amount_ttc += other.paid_invoice_amount_ttc
        self.unpaid_invoice_amount_ttc += other.unpaid_invoice_amount_ttc
        self.on_hold_invoice_amount_ttc += other.on_hold_invoice_amount_ttc
        self.quote_count += other.quote_count
        self.validated_quote_count += other.validated_quote_count
        self.invoice_count += other.invoice_count


def _new_transactions() -> list[Transaction]:
    return []


def _new_supplier_groups() -> dict[int | None, FinancialTotals]:
    return {}


@dataclass
class LotFinancials:
    lot: Lot
    totals: FinancialTotals = field(default_factory=FinancialTotals)
    transactions: list[Transaction] = field(default_factory=_new_transactions)
    # One group per supplier with transactions in the lot; None is
    # « Sans fournisseur ».
    suppliers: dict[int | None, FinancialTotals] = field(
        default_factory=_new_supplier_groups
    )


@dataclass(frozen=True)
class ProjectFinancials:
    project_id: int
    project_name: str
    generated_at: datetime
    totals: FinancialTotals
    # Every visible lot of the project, in display order, empty ones included.
    lots: list[LotFinancials]
    # Each supplier's figures over the visible lots: the sum of its lot groups.
    suppliers: dict[int, FinancialTotals]


def financial_totals_to_read_model(totals: FinancialTotals) -> FinancialTotalsRead:
    return FinancialTotalsRead(
        planned_cost_ttc=totals.planned_cost_ttc,
        validated_quote_amount_ttc=totals.validated_quote_amount_ttc,
        invoiced_amount_ttc=totals.invoiced_amount_ttc,
        paid_invoice_amount_ttc=totals.paid_invoice_amount_ttc,
        unpaid_invoice_amount_ttc=totals.unpaid_invoice_amount_ttc,
        on_hold_invoice_amount_ttc=totals.on_hold_invoice_amount_ttc,
        to_pay_amount_ttc=totals.to_pay_amount_ttc,
        quote_count=totals.quote_count,
        validated_quote_count=totals.validated_quote_count,
        invoice_count=totals.invoice_count,
    )


def _is_invoice(transaction: Transaction) -> bool:
    return transaction.transaction_type == TransactionType.invoice


@dataclass(frozen=True)
class FinancialEngine:
    async def get_project_summary(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
    ) -> ProjectFinancialSummaryRead | None:
        project_financials = await self.calculate_project_financials(
            db,
            project_id,
            user_id,
        )
        if project_financials is None:
            return None

        return project_financials_to_read_model(project_financials)

    async def get_dashboard_financial_overview(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
    ) -> DashboardFinancialOverviewRead | None:
        project_financials = await self.calculate_project_financials(
            db,
            project_id,
            user_id,
        )
        if project_financials is None:
            return None

        totals = project_financials.totals
        return DashboardFinancialOverviewRead(
            project_id=project_financials.project_id,
            generated_at=project_financials.generated_at,
            planned_cost_ttc=totals.planned_cost_ttc,
            invoiced_amount_ttc=totals.invoiced_amount_ttc,
            paid_invoice_amount_ttc=totals.paid_invoice_amount_ttc,
            to_pay_amount_ttc=totals.to_pay_amount_ttc,
        )

    async def get_dashboard_spending_over_time(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
    ) -> list[DashboardSpendingOverTimePointRead] | None:
        project_financials = await self.calculate_project_financials(
            db,
            project_id,
            user_id,
        )
        if project_financials is None:
            return None

        # Facturé: every active invoice, whatever its payment status.
        monthly_totals: dict[str, Decimal] = {}
        for transaction in iter_project_transactions(project_financials):
            if not _is_invoice(transaction):
                continue

            month = transaction.issued_date.strftime('%Y-%m')
            monthly_totals[month] = (
                monthly_totals.get(month, ZERO_MONEY) + transaction.amount_ttc
            )

        return [
            DashboardSpendingOverTimePointRead(
                month=month,
                invoiced_amount_ttc=amount,
            )
            for month, amount in sorted(monthly_totals.items())
        ]

    async def get_dashboard_invoiced_by_lot(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
    ) -> list[DashboardLotInvoicedRead] | None:
        """« Facturé par lot »: paid and À payer per lot, lots with a non-zero
        Facturé only, in the lots' display order."""
        project_financials = await self.calculate_project_financials(
            db,
            project_id,
            user_id,
        )
        if project_financials is None:
            return None

        return [
            DashboardLotInvoicedRead(
                lot_id=lot_financials.lot.id,
                lot_code=lot_financials.lot.code,
                lot_designation=lot_financials.lot.designation,
                invoiced_amount_ttc=lot_financials.totals.invoiced_amount_ttc,
                paid_invoice_amount_ttc=(
                    lot_financials.totals.paid_invoice_amount_ttc
                ),
                to_pay_amount_ttc=lot_financials.totals.to_pay_amount_ttc,
            )
            for lot_financials in project_financials.lots
            if lot_financials.totals.invoiced_amount_ttc != ZERO_MONEY
        ]

    async def get_dashboard_supplier_distribution(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
    ) -> list[DashboardSupplierDistributionRead] | None:
        project_financials = await self.calculate_project_financials(
            db,
            project_id,
            user_id,
        )
        if project_financials is None:
            return None

        # Facturé: every active invoice, whatever its payment status.
        supplier_totals: dict[tuple[int | None, str], Decimal] = {}
        for transaction in iter_project_transactions(project_financials):
            if not _is_invoice(transaction):
                continue

            supplier = transaction.supplier
            is_active_supplier = supplier is not None and supplier.deleted_at is None
            key = (
                supplier.id if supplier is not None and is_active_supplier else None,
                supplier.name
                if supplier is not None and is_active_supplier
                else NO_SUPPLIER_LABEL,
            )
            supplier_totals[key] = (
                supplier_totals.get(key, ZERO_MONEY) + transaction.amount_ttc
            )

        return [
            DashboardSupplierDistributionRead(
                supplier_id=supplier_id,
                supplier_name=supplier_name,
                invoiced_amount_ttc=amount,
            )
            for (supplier_id, supplier_name), amount in sorted(
                supplier_totals.items(),
                key=lambda item: (-item[1], item[0][1]),
            )
        ]

    async def get_dashboard_unpaid_invoices(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
    ) -> DashboardTransactionWidgetRead | None:
        return await self._get_dashboard_transaction_widget(
            db,
            project_id,
            user_id,
            predicate=lambda transaction: (
                transaction.transaction_type == TransactionType.invoice
                and transaction.invoice_status == InvoiceStatus.unpaid
            ),
        )

    async def get_dashboard_quotes_to_follow_up(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
    ) -> DashboardTransactionWidgetRead | None:
        """The quotes still to confirm or to negotiate, in one widget."""
        return await self._get_dashboard_transaction_widget(
            db,
            project_id,
            user_id,
            predicate=lambda transaction: (
                transaction.transaction_type == TransactionType.quote
                and transaction.quote_status
                in (QuoteStatus.to_confirm, QuoteStatus.to_negotiate)
            ),
        )

    async def get_dashboard_missing_documents(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
    ) -> DashboardTransactionWidgetRead | None:
        return await self._get_dashboard_transaction_widget(
            db,
            project_id,
            user_id,
            predicate=lambda transaction: not has_active_documents(transaction),
        )

    async def get_dashboard_recent_transactions(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
    ) -> DashboardTransactionWidgetRead | None:
        return await self._get_dashboard_transaction_widget(
            db,
            project_id,
            user_id,
            predicate=lambda _transaction: True,
        )

    async def _get_dashboard_transaction_widget(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
        *,
        predicate: Callable[[Transaction], bool],
    ) -> DashboardTransactionWidgetRead | None:
        project_financials = await self.calculate_project_financials(
            db,
            project_id,
            user_id,
        )
        if project_financials is None:
            return None

        transactions = [
            transaction
            for transaction in iter_project_transactions(project_financials)
            if predicate(transaction)
        ]
        transactions.sort(
            key=lambda transaction: (
                transaction.issued_date,
                transaction.id,
            ),
            reverse=True,
        )

        return DashboardTransactionWidgetRead(
            count=len(transactions),
            items=[
                dashboard_transaction_item_to_read_model(transaction)
                for transaction in transactions[:DASHBOARD_WIDGET_LIMIT]
            ],
        )

    async def calculate_project_financials(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
    ) -> ProjectFinancials | None:
        project = await get_active_project(db, project_id, user_id)
        if project is None:
            return None

        lots = {
            lot.id: LotFinancials(lot=lot)
            for lot in await get_visible_lots(db, project_id)
        }
        project_totals = FinancialTotals()

        for transaction in await self._get_active_transactions(db, project_id):
            lot_financials = lots.get(transaction.lot_id)
            if lot_financials is None:
                # Hidden lots count nowhere (a lot with active transactions
                # cannot be hidden, so this is a safety net).
                continue
            group = lot_financials.suppliers.setdefault(
                transaction.supplier_id, FinancialTotals()
            )
            group.add_transaction(transaction)
            lot_financials.transactions.append(transaction)

        supplier_totals: dict[int, FinancialTotals] = {}
        for lot_financials in lots.values():
            # A lot is the sum of its supplier groups, each at its own max.
            for supplier_id, group in lot_financials.suppliers.items():
                lot_financials.totals.merge(group)
                if supplier_id is not None:
                    supplier_totals.setdefault(supplier_id, FinancialTotals()).merge(
                        group
                    )
            project_totals.merge(lot_financials.totals)

        return ProjectFinancials(
            project_id=project_id,
            project_name=project.name,
            generated_at=utcnow(),
            totals=project_totals,
            lots=list(lots.values()),
            suppliers=supplier_totals,
        )

    async def _get_active_transactions(
        self,
        db: AsyncSession,
        project_id: int,
    ) -> list[Transaction]:
        """Active transactions of the project, through ``project_id``; the
        caller has checked that the project belongs to the user."""
        result = await db.execute(
            select(Transaction)
            .options(
                joinedload(Transaction.supplier),
                joinedload(Transaction.lot),
                selectinload(Transaction.documents),
                with_loader_criteria(
                    Document,
                    Document.deleted_at.is_(None),
                ),
            )
            .where(
                Transaction.project_id == project_id,
                Transaction.deleted_at.is_(None),
            )
            .order_by(Transaction.issued_date, Transaction.id)
        )
        return list(result.unique().scalars().all())


def iter_project_transactions(
    project_financials: ProjectFinancials,
) -> list[Transaction]:
    return [
        transaction
        for lot_financials in project_financials.lots
        for transaction in lot_financials.transactions
    ]


def has_active_documents(transaction: Transaction) -> bool:
    return any(document.deleted_at is None for document in transaction.documents)


def dashboard_transaction_item_to_read_model(
    transaction: Transaction,
) -> DashboardTransactionWidgetItemRead:
    return DashboardTransactionWidgetItemRead(
        transaction_id=transaction.id,
        lot_id=transaction.lot.id,
        lot_code=transaction.lot.code,
        lot_designation=transaction.lot.designation,
        transaction_type=transaction.transaction_type,
        title=transaction.title,
        reference=transaction.reference,
        amount_ttc=transaction.amount_ttc,
        issued_date=transaction.issued_date,
        due_date=transaction.due_date,
        description=transaction.description,
        quote_status=transaction.quote_status,
        invoice_status=transaction.invoice_status,
        supplier_name=transaction.supplier.name if transaction.supplier else None,
        has_documents=has_active_documents(transaction),
    )


def _supplier_order(supplier_id: int | None) -> tuple[bool, int]:
    # Suppliers by id, « Sans fournisseur » last.
    return (supplier_id is None, supplier_id or 0)


def lot_financials_to_read_model(
    lot_financials: LotFinancials,
) -> LotFinancialSummaryRead:
    lot = lot_financials.lot
    return LotFinancialSummaryRead(
        lot_id=lot.id,
        project_id=lot.project_id,
        code=lot.code,
        designation=lot.designation,
        is_global=lot.is_global,
        suppliers=[
            LotSupplierFinancialSummaryRead(
                supplier_id=supplier_id,
                **financial_totals_to_read_model(group).model_dump(),
            )
            for supplier_id, group in sorted(
                lot_financials.suppliers.items(),
                key=lambda item: _supplier_order(item[0]),
            )
        ],
        **financial_totals_to_read_model(lot_financials.totals).model_dump(),
    )


def project_financials_to_read_model(
    project_financials: ProjectFinancials,
) -> ProjectFinancialSummaryRead:
    return ProjectFinancialSummaryRead(
        project_id=project_financials.project_id,
        generated_at=project_financials.generated_at,
        lots=[
            lot_financials_to_read_model(lot_financials)
            for lot_financials in project_financials.lots
        ],
        suppliers=[
            SupplierFinancialSummaryRead(
                supplier_id=supplier_id,
                **financial_totals_to_read_model(totals).model_dump(),
            )
            for supplier_id, totals in sorted(project_financials.suppliers.items())
        ],
        **financial_totals_to_read_model(project_financials.totals).model_dump(),
    )


financial_engine = FinancialEngine()
