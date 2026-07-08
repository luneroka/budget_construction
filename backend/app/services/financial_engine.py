from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload, with_loader_criteria

from app.models.budget_line import BudgetLine
from app.models.category import Category
from app.models.product import Product
from app.models.project import Project
from app.models.subcategory import Subcategory
from app.models.template_item import TemplateItem
from app.models.transaction import (
    InvoiceStatus,
    QuoteStatus,
    Transaction,
    TransactionType,
)
from app.schemas.financial_engine import (
    BudgetLineFinancialSummaryRead,
    DashboardCategoryBudgetActualRead,
    DashboardCategoryDistributionRead,
    DashboardFinancialOverviewRead,
    DashboardSpendingOverTimePointRead,
    DashboardSupplierDistributionRead,
    FinancialTotalsRead,
    ProductFinancialSummaryRead,
    ProjectFinancialSummaryRead,
)

ZERO_MONEY = Decimal('0.00')


@dataclass
class FinancialTotals:
    selected_budget_amount_ttc: Decimal = ZERO_MONEY
    selected_quote_budget_amount_ttc: Decimal = ZERO_MONEY
    selected_diy_budget_amount_ttc: Decimal = ZERO_MONEY
    quote_amount_ttc: Decimal = ZERO_MONEY
    validated_quote_amount_ttc: Decimal = ZERO_MONEY
    diy_estimate_amount_ttc: Decimal = ZERO_MONEY
    actual_cost_amount_ttc: Decimal = ZERO_MONEY
    paid_invoice_amount_ttc: Decimal = ZERO_MONEY
    unpaid_invoice_amount_ttc: Decimal = ZERO_MONEY
    on_hold_invoice_amount_ttc: Decimal = ZERO_MONEY
    quote_count: int = 0
    validated_quote_count: int = 0
    diy_estimate_count: int = 0
    invoice_count: int = 0

    def add_transaction(self, transaction: Transaction, *, is_selected: bool) -> None:
        amount = transaction.amount_ttc

        if transaction.transaction_type == TransactionType.quote:
            self.quote_amount_ttc += amount
            self.quote_count += 1
            if transaction.quote_status == QuoteStatus.validated:
                self.validated_quote_amount_ttc += amount
                self.validated_quote_count += 1
            if is_selected:
                self.selected_budget_amount_ttc += amount
                self.selected_quote_budget_amount_ttc += amount
            return

        if transaction.transaction_type == TransactionType.diy_estimate:
            self.diy_estimate_amount_ttc += amount
            self.diy_estimate_count += 1
            if is_selected:
                self.selected_budget_amount_ttc += amount
                self.selected_diy_budget_amount_ttc += amount
            return

        if transaction.transaction_type == TransactionType.invoice:
            self.actual_cost_amount_ttc += amount
            self.invoice_count += 1
            self.add_invoice_status_amount(transaction)

    def add_invoice_status_amount(self, transaction: Transaction) -> None:
        if transaction.invoice_status == InvoiceStatus.paid:
            self.paid_invoice_amount_ttc += transaction.amount_ttc
        elif transaction.invoice_status == InvoiceStatus.unpaid:
            self.unpaid_invoice_amount_ttc += transaction.amount_ttc
        elif transaction.invoice_status == InvoiceStatus.on_hold:
            self.on_hold_invoice_amount_ttc += transaction.amount_ttc

    def merge(self, other: FinancialTotals) -> None:
        self.selected_budget_amount_ttc += other.selected_budget_amount_ttc
        self.selected_quote_budget_amount_ttc += other.selected_quote_budget_amount_ttc
        self.selected_diy_budget_amount_ttc += other.selected_diy_budget_amount_ttc
        self.quote_amount_ttc += other.quote_amount_ttc
        self.validated_quote_amount_ttc += other.validated_quote_amount_ttc
        self.diy_estimate_amount_ttc += other.diy_estimate_amount_ttc
        self.actual_cost_amount_ttc += other.actual_cost_amount_ttc
        self.paid_invoice_amount_ttc += other.paid_invoice_amount_ttc
        self.unpaid_invoice_amount_ttc += other.unpaid_invoice_amount_ttc
        self.on_hold_invoice_amount_ttc += other.on_hold_invoice_amount_ttc
        self.quote_count += other.quote_count
        self.validated_quote_count += other.validated_quote_count
        self.diy_estimate_count += other.diy_estimate_count
        self.invoice_count += other.invoice_count


@dataclass(frozen=True)
class BudgetLineFinancials:
    budget_line: BudgetLine
    totals: FinancialTotals


def _new_budget_line_financials() -> list[BudgetLineFinancials]:
    return []


@dataclass
class ProductFinancials:
    product: Product
    totals: FinancialTotals = field(default_factory=FinancialTotals)
    budget_lines: list[BudgetLineFinancials] = field(
        default_factory=_new_budget_line_financials
    )


@dataclass(frozen=True)
class ProjectFinancials:
    project_id: int
    generated_at: datetime
    totals: FinancialTotals
    products: list[ProductFinancials]


def financial_totals_to_read_model(totals: FinancialTotals) -> FinancialTotalsRead:
    selected_budget_variance = (
        totals.selected_budget_amount_ttc - totals.actual_cost_amount_ttc
    )
    budget_completion_percentage = (
        (totals.actual_cost_amount_ttc / totals.selected_budget_amount_ttc)
        * Decimal('100')
        if totals.selected_budget_amount_ttc > ZERO_MONEY
        else ZERO_MONEY
    ).quantize(Decimal('0.01'))

    return FinancialTotalsRead(
        selected_budget_amount_ttc=totals.selected_budget_amount_ttc,
        selected_quote_budget_amount_ttc=totals.selected_quote_budget_amount_ttc,
        selected_diy_budget_amount_ttc=totals.selected_diy_budget_amount_ttc,
        quote_amount_ttc=totals.quote_amount_ttc,
        validated_quote_amount_ttc=totals.validated_quote_amount_ttc,
        diy_estimate_amount_ttc=totals.diy_estimate_amount_ttc,
        actual_cost_amount_ttc=totals.actual_cost_amount_ttc,
        paid_invoice_amount_ttc=totals.paid_invoice_amount_ttc,
        unpaid_invoice_amount_ttc=totals.unpaid_invoice_amount_ttc,
        on_hold_invoice_amount_ttc=totals.on_hold_invoice_amount_ttc,
        remaining_budget_amount_ttc=selected_budget_variance,
        selected_budget_variance_ttc=selected_budget_variance,
        selected_quote_budget_variance_ttc=(
            totals.selected_quote_budget_amount_ttc - totals.actual_cost_amount_ttc
        ),
        budget_completion_percentage=budget_completion_percentage,
        quote_count=totals.quote_count,
        validated_quote_count=totals.validated_quote_count,
        diy_estimate_count=totals.diy_estimate_count,
        invoice_count=totals.invoice_count,
    )


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

        totals = financial_totals_to_read_model(project_financials.totals)
        return DashboardFinancialOverviewRead(
            project_id=project_financials.project_id,
            generated_at=project_financials.generated_at,
            selected_budget_amount_ttc=totals.selected_budget_amount_ttc,
            actual_cost_amount_ttc=totals.actual_cost_amount_ttc,
            remaining_budget_amount_ttc=totals.remaining_budget_amount_ttc,
            selected_budget_variance_ttc=totals.selected_budget_variance_ttc,
            budget_completion_percentage=totals.budget_completion_percentage,
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

        monthly_totals: dict[str, Decimal] = {}
        for transaction in iter_project_transactions(project_financials):
            if transaction.transaction_type != TransactionType.invoice:
                continue

            month = transaction.issued_date.strftime('%Y-%m')
            monthly_totals[month] = (
                monthly_totals.get(month, ZERO_MONEY) + transaction.amount_ttc
            )

        return [
            DashboardSpendingOverTimePointRead(
                month=month,
                actual_cost_amount_ttc=amount,
            )
            for month, amount in sorted(monthly_totals.items())
        ]

    async def get_dashboard_budget_vs_actual(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
    ) -> list[DashboardCategoryBudgetActualRead] | None:
        project_financials = await self.calculate_project_financials(
            db,
            project_id,
            user_id,
        )
        if project_financials is None:
            return None

        return category_budget_actuals_to_read_models(project_financials)

    async def get_dashboard_category_distribution(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
    ) -> list[DashboardCategoryDistributionRead] | None:
        project_financials = await self.calculate_project_financials(
            db,
            project_id,
            user_id,
        )
        if project_financials is None:
            return None

        return [
            DashboardCategoryDistributionRead(
                category_id=category.category_id,
                category_name=category.category_name,
                actual_cost_amount_ttc=category.actual_cost_amount_ttc,
            )
            for category in category_budget_actuals_to_read_models(project_financials)
            if category.actual_cost_amount_ttc > ZERO_MONEY
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

        supplier_totals: dict[tuple[int | None, str], Decimal] = {}
        for transaction in iter_project_transactions(project_financials):
            if transaction.transaction_type != TransactionType.invoice:
                continue

            supplier = transaction.supplier
            supplier_id = (
                supplier.id
                if supplier is not None and supplier.deleted_at is None
                else None
            )
            supplier_name = (
                supplier.name
                if supplier is not None and supplier.deleted_at is None
                else 'Sans fournisseur'
            )
            key = (supplier_id, supplier_name)
            supplier_totals[key] = (
                supplier_totals.get(key, ZERO_MONEY) + transaction.amount_ttc
            )

        return [
            DashboardSupplierDistributionRead(
                supplier_id=supplier_id,
                supplier_name=supplier_name,
                actual_cost_amount_ttc=amount,
            )
            for (supplier_id, supplier_name), amount in sorted(
                supplier_totals.items(),
                key=lambda item: (-item[1], item[0][1]),
            )
        ]

    async def calculate_project_financials(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
    ) -> ProjectFinancials | None:
        project = await self._get_active_project(db, project_id, user_id)
        if project is None:
            return None

        budget_lines = await self._get_budget_lines(db, project_id)
        project_totals = FinancialTotals()
        products = await self._get_template_product_financials(db, project)

        for budget_line in budget_lines:
            line_totals = self._calculate_budget_line_totals(budget_line)
            project_totals.merge(line_totals)

            product_financials = products.setdefault(
                budget_line.product_id,
                ProductFinancials(product=budget_line.product),
            )
            product_financials.totals.merge(line_totals)
            product_financials.budget_lines.append(
                BudgetLineFinancials(
                    budget_line=budget_line,
                    totals=line_totals,
                )
            )

        return ProjectFinancials(
            project_id=project_id,
            generated_at=datetime.now(UTC).replace(tzinfo=None),
            totals=project_totals,
            products=list(products.values()),
        )

    async def _get_active_project(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
    ) -> Project | None:
        result = await db.execute(
            select(Project).where(
                Project.id == project_id,
                Project.user_id == user_id,
                Project.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def _get_template_product_financials(
        self,
        db: AsyncSession,
        project: Project,
    ) -> dict[int, ProductFinancials]:
        if project.template_id is None:
            return {}

        result = await db.execute(
            select(TemplateItem)
            .join(Product, TemplateItem.product_id == Product.id)
            .join(Subcategory, Product.subcategory_id == Subcategory.id)
            .join(Category, Subcategory.category_id == Category.id)
            .options(
                joinedload(TemplateItem.product)
                .joinedload(Product.subcategory)
                .joinedload(Subcategory.category)
            )
            .where(
                TemplateItem.template_id == project.template_id,
                Product.is_active.is_(True),
                Subcategory.is_active.is_(True),
                Category.is_active.is_(True),
            )
            .order_by(TemplateItem.sort_order, TemplateItem.id)
        )

        return {
            template_item.product_id: ProductFinancials(product=template_item.product)
            for template_item in result.scalars().all()
        }

    async def _get_budget_lines(
        self,
        db: AsyncSession,
        project_id: int,
    ) -> list[BudgetLine]:
        result = await db.execute(
            select(BudgetLine)
            .options(
                joinedload(BudgetLine.product)
                .joinedload(Product.subcategory)
                .joinedload(Subcategory.category),
                selectinload(BudgetLine.transactions).joinedload(Transaction.supplier),
                with_loader_criteria(
                    Transaction,
                    Transaction.deleted_at.is_(None),
                ),
            )
            .where(
                BudgetLine.project_id == project_id,
                BudgetLine.deleted_at.is_(None),
            )
            .order_by(BudgetLine.sort_order, BudgetLine.id)
        )
        return list(result.scalars().all())

    def _calculate_budget_line_totals(
        self,
        budget_line: BudgetLine,
    ) -> FinancialTotals:
        totals = FinancialTotals()
        for transaction in budget_line.transactions:
            totals.add_transaction(
                transaction,
                is_selected=(
                    (
                        transaction.transaction_type == TransactionType.quote
                        and transaction.id == budget_line.selected_quote_transaction_id
                    )
                    or (
                        transaction.transaction_type == TransactionType.diy_estimate
                        and transaction.id
                        == budget_line.selected_diy_estimate_transaction_id
                    )
                ),
            )
        return totals


def iter_project_transactions(
    project_financials: ProjectFinancials,
) -> list[Transaction]:
    return [
        transaction
        for product_financials in project_financials.products
        for budget_line_financials in product_financials.budget_lines
        for transaction in budget_line_financials.budget_line.transactions
    ]


def category_budget_actuals_to_read_models(
    project_financials: ProjectFinancials,
) -> list[DashboardCategoryBudgetActualRead]:
    category_totals: dict[int, tuple[str, FinancialTotals]] = {}

    for product_financials in project_financials.products:
        category = product_financials.product.subcategory.category
        _, totals = category_totals.setdefault(
            category.id,
            (category.name, FinancialTotals()),
        )
        totals.merge(product_financials.totals)

    return [
        DashboardCategoryBudgetActualRead(
            category_id=category_id,
            category_name=category_name,
            selected_budget_amount_ttc=totals.selected_budget_amount_ttc,
            actual_cost_amount_ttc=totals.actual_cost_amount_ttc,
        )
        for category_id, (category_name, totals) in sorted(
            category_totals.items(),
            key=lambda item: item[1][0],
        )
    ]


def budget_line_financials_to_read_model(
    budget_line_financials: BudgetLineFinancials,
) -> BudgetLineFinancialSummaryRead:
    budget_line = budget_line_financials.budget_line
    return BudgetLineFinancialSummaryRead(
        budget_line_id=budget_line.id,
        name=budget_line.name,
        item_type=budget_line.item_type,
        selected_quote_transaction_id=budget_line.selected_quote_transaction_id,
        selected_diy_estimate_transaction_id=(
            budget_line.selected_diy_estimate_transaction_id
        ),
        **financial_totals_to_read_model(budget_line_financials.totals).model_dump(),
    )


def product_financials_to_read_model(
    product_financials: ProductFinancials,
) -> ProductFinancialSummaryRead:
    product = product_financials.product
    subcategory = product.subcategory
    category = subcategory.category

    return ProductFinancialSummaryRead(
        product_id=product.id,
        product_name=product.name,
        subcategory_name=subcategory.name,
        category_name=category.name,
        budget_lines=[
            budget_line_financials_to_read_model(budget_line_financials)
            for budget_line_financials in product_financials.budget_lines
        ],
        **financial_totals_to_read_model(product_financials.totals).model_dump(),
    )


def project_financials_to_read_model(
    project_financials: ProjectFinancials,
) -> ProjectFinancialSummaryRead:
    return ProjectFinancialSummaryRead(
        project_id=project_financials.project_id,
        generated_at=project_financials.generated_at,
        products=[
            product_financials_to_read_model(product_financials)
            for product_financials in project_financials.products
        ],
        **financial_totals_to_read_model(project_financials.totals).model_dump(),
    )


financial_engine = FinancialEngine()
