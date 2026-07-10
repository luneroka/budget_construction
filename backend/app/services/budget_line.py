from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.budget_line import BudgetLine, BudgetLineType
from app.models.category import Category
from app.models.product import Product
from app.models.project import Project
from app.models.subcategory import Subcategory
from app.models.template_item import TemplateItem
from app.models.transaction import Transaction
from app.repositories.budget_line import BudgetLineValidationError
from app.schemas.budget_line import (
    ProductLineConversionStrategy,
    ProductLineConvertToBreakdown,
)


@dataclass(frozen=True)
class BudgetLineService:
    async def ensure_for_project_product(
        self,
        db: AsyncSession,
        project_id: int,
        product_id: int,
        user_id: int,
        *,
        name: str | None = None,
        item_type: BudgetLineType = BudgetLineType.product,
    ) -> BudgetLine | None:
        project = await self._get_active_project(db, project_id, user_id)
        if project is None:
            return None

        product = await self._get_active_product(db, product_id)
        if product is None:
            raise BudgetLineValidationError('Product not found or inactive')

        template_item = await self._find_template_item_for_project_product(
            db,
            project=project,
            product_id=product_id,
        )
        budget_line_name = self._resolve_budget_line_name(
            template_item=template_item,
            name=name,
            item_type=item_type,
        )

        existing_line = await self._find_reusable_budget_line(
            db,
            project_id=project_id,
            product_id=product_id,
            name=budget_line_name,
            item_type=item_type,
        )
        if existing_line is not None:
            return existing_line

        budget_line = BudgetLine(
            project_id=project_id,
            template_item_id=template_item.id,
            product_id=product_id,
            name=budget_line_name,
            item_type=item_type,
            sort_order=template_item.sort_order,
        )

        db.add(budget_line)
        await db.flush()

        return budget_line

    async def find_single_for_project_product_transaction(
        self,
        db: AsyncSession,
        project_id: int,
        product_id: int,
        user_id: int,
    ) -> BudgetLine | None:
        project = await self._get_active_project(db, project_id, user_id)
        if project is None:
            return None

        product = await self._get_active_product(db, product_id)
        if product is None:
            raise BudgetLineValidationError('Product not found or inactive')

        active_lines = await self._get_active_lines_for_project_product(
            db,
            project_id=project_id,
            product_id=product_id,
        )
        if not active_lines:
            raise BudgetLineValidationError(
                'No active budget line exists for this product'
            )
        if len(active_lines) > 1:
            raise BudgetLineValidationError(
                'Select a specific budget line for this product transaction'
            )

        return active_lines[0]

    async def ensure_for_project_product_invoice_transaction(
        self,
        db: AsyncSession,
        project_id: int,
        product_id: int,
        user_id: int,
    ) -> BudgetLine | None:
        """Resolve product-endpoint invoices without choosing split details.

        If no budget line exists yet, the first invoice creates a whole-product
        line. Split invoices must target a specific budget_line_id after the
        frontend has created or selected the intended breakdown line.
        """
        project = await self._get_active_project(db, project_id, user_id)
        if project is None:
            return None

        product = await self._get_active_product(db, product_id)
        if product is None:
            raise BudgetLineValidationError('Product not found or inactive')

        active_lines = await self._get_active_lines_for_project_product(
            db,
            project_id=project_id,
            product_id=product_id,
        )
        if not active_lines:
            return await self.ensure_for_project_product(
                db,
                project_id,
                product_id,
                user_id,
                item_type=BudgetLineType.product,
            )
        if len(active_lines) > 1:
            raise BudgetLineValidationError(
                'Select a specific budget line for this product transaction'
            )

        return active_lines[0]

    async def convert_product_line_to_breakdown_lines(
        self,
        db: AsyncSession,
        project_id: int,
        product_id: int,
        conversion_data: ProductLineConvertToBreakdown,
        user_id: int,
    ) -> list[BudgetLine] | None:
        project = await self._get_active_project(db, project_id, user_id)
        if project is None:
            return None

        product = await self._get_active_product(db, product_id)
        if product is None:
            raise BudgetLineValidationError('Product not found or inactive')

        template_item = await self._find_template_item_for_project_product(
            db,
            project=project,
            product_id=product_id,
        )

        active_lines = await self._get_active_lines_for_project_product(
            db,
            project_id=project_id,
            product_id=product_id,
        )
        product_lines = [
            line for line in active_lines if line.item_type == BudgetLineType.product
        ]
        breakdown_lines = [
            line for line in active_lines if line.item_type == BudgetLineType.breakdown
        ]
        if len(product_lines) != 1:
            raise BudgetLineValidationError('Whole-product budget line not found')
        if breakdown_lines:
            raise BudgetLineValidationError(
                'Product is already budgeted with breakdown lines'
            )

        product_line = product_lines[0]
        has_transactions = await self._has_active_transactions(db, product_line.id)
        strategy = self._resolve_conversion_strategy(
            conversion_data,
            has_transactions=has_transactions,
        )

        if strategy == ProductLineConversionStrategy.reuse_existing_as_breakdown:
            existing_name, new_names = self._resolve_reuse_conversion_names(
                conversion_data
            )
            self._validate_conversion_names(
                [existing_name, *new_names],
                active_lines=active_lines,
                converted_line_id=product_line.id,
            )
            product_line.item_type = BudgetLineType.breakdown
            product_line.name = existing_name
            names_to_create = new_names
        else:
            if conversion_data.existing_line_new_name is not None:
                raise BudgetLineValidationError(
                    'existing_line_new_name is only allowed when reusing the existing line'
                )
            names_to_create = self._normalize_breakdown_names(
                conversion_data.new_breakdown_names
            )
            if not names_to_create:
                raise BudgetLineValidationError(
                    'At least one breakdown name is required'
                )
            self._validate_conversion_names(
                names_to_create,
                active_lines=active_lines,
                converted_line_id=product_line.id,
            )
            await self._archive_budget_line(db, product_line)

        for name in names_to_create:
            db.add(
                BudgetLine(
                    project_id=project_id,
                    template_item_id=template_item.id,
                    product_id=product_id,
                    name=name,
                    item_type=BudgetLineType.breakdown,
                    sort_order=template_item.sort_order,
                )
            )

        await db.commit()
        return await self._get_active_lines_for_project_product(
            db,
            project_id=project_id,
            product_id=product_id,
            with_product=True,
        )

    async def _get_active_project(
        self, db: AsyncSession, project_id: int, user_id: int
    ) -> Project | None:
        result = await db.execute(
            select(Project).where(
                Project.id == project_id,
                Project.user_id == user_id,
                Project.deleted_at.is_(None),
            )
        )

        return result.scalar_one_or_none()

    async def _get_active_product(
        self, db: AsyncSession, product_id: int
    ) -> Product | None:
        result = await db.execute(
            select(Product)
            .join(Subcategory, Product.subcategory_id == Subcategory.id)
            .join(Category, Subcategory.category_id == Category.id)
            .where(
                Product.id == product_id,
                Product.is_active.is_(True),
                Subcategory.is_active.is_(True),
                Category.is_active.is_(True),
            )
        )

        return result.scalar_one_or_none()

    async def _get_active_lines_for_project_product(
        self,
        db: AsyncSession,
        *,
        project_id: int,
        product_id: int,
        with_product: bool = False,
    ) -> list[BudgetLine]:
        query = select(BudgetLine).where(
            BudgetLine.project_id == project_id,
            BudgetLine.product_id == product_id,
            BudgetLine.deleted_at.is_(None),
        )
        if with_product:
            query = query.options(
                joinedload(BudgetLine.product)
                .joinedload(Product.subcategory)
                .joinedload(Subcategory.category)
            )
        query = query.order_by(BudgetLine.sort_order, BudgetLine.id)

        result = await db.execute(query)
        return list(result.scalars().all())

    async def _has_active_transactions(
        self,
        db: AsyncSession,
        budget_line_id: int,
    ) -> bool:
        result = await db.execute(
            select(Transaction.id)
            .where(
                Transaction.budget_line_id == budget_line_id,
                Transaction.deleted_at.is_(None),
            )
            .limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def _archive_budget_line(
        self,
        db: AsyncSession,
        budget_line: BudgetLine,
    ) -> None:
        deleted_at = datetime.now(UTC).replace(tzinfo=None)
        budget_line.deleted_at = deleted_at
        budget_line.updated_at = deleted_at

    def _normalize_breakdown_names(self, names: list[str]) -> list[str]:
        normalized = [name.strip() for name in names]
        return [name for name in normalized if name]

    def _resolve_reuse_conversion_names(
        self,
        conversion_data: ProductLineConvertToBreakdown,
    ) -> tuple[str, list[str]]:
        new_names = self._normalize_breakdown_names(
            conversion_data.new_breakdown_names
        )
        existing_name = (
            conversion_data.existing_line_new_name.strip()
            if conversion_data.existing_line_new_name is not None
            else None
        )
        if existing_name == '':
            existing_name = None

        if existing_name is None:
            if not new_names:
                raise BudgetLineValidationError(
                    'At least one breakdown name is required'
                )
            existing_name = new_names.pop(0)

        self._validate_unique_names([existing_name, *new_names])
        return existing_name, new_names

    def _resolve_conversion_strategy(
        self,
        conversion_data: ProductLineConvertToBreakdown,
        *,
        has_transactions: bool,
    ) -> ProductLineConversionStrategy:
        if conversion_data.strategy is not None:
            return conversion_data.strategy

        if has_transactions:
            raise BudgetLineValidationError(
                'Conversion strategy is required when the budget line has transactions'
            )

        if self._first_requested_breakdown_name(conversion_data) is not None:
            return ProductLineConversionStrategy.reuse_existing_as_breakdown

        return ProductLineConversionStrategy.archive_existing

    def _first_requested_breakdown_name(
        self,
        conversion_data: ProductLineConvertToBreakdown,
    ) -> str | None:
        existing_name = (
            conversion_data.existing_line_new_name.strip()
            if conversion_data.existing_line_new_name is not None
            else None
        )
        if existing_name:
            return existing_name

        new_names = self._normalize_breakdown_names(
            conversion_data.new_breakdown_names
        )
        return new_names[0] if new_names else None

    def _validate_conversion_names(
        self,
        names: list[str],
        *,
        active_lines: list[BudgetLine],
        converted_line_id: int,
    ) -> None:
        self._validate_unique_names(names)

        existing_names = {
            self._normalize_name_key(line.name)
            for line in active_lines
            if line.id != converted_line_id and line.deleted_at is None
        }
        requested_names = {self._normalize_name_key(name) for name in names}
        if existing_names.intersection(requested_names):
            raise BudgetLineValidationError(
                'Breakdown name already exists for this product'
            )

    def _validate_unique_names(self, names: list[str]) -> None:
        normalized_names = [self._normalize_name_key(name) for name in names]
        if len(set(normalized_names)) != len(normalized_names):
            raise BudgetLineValidationError('Breakdown names must be unique')

    def _normalize_name_key(self, name: str) -> str:
        return name.strip().casefold()

    async def _find_template_item_for_project_product(
        self,
        db: AsyncSession,
        *,
        project: Project,
        product_id: int,
    ) -> TemplateItem:
        """Return the template item or raise the domain validation error."""
        if project.template_id is None:
            raise BudgetLineValidationError(
                'Cannot create budget lines because this project has no template'
            )

        result = await db.execute(
            select(TemplateItem).where(
                TemplateItem.template_id == project.template_id,
                TemplateItem.product_id == product_id,
            )
        )
        template_item = result.scalar_one_or_none()
        if template_item is None:
            raise BudgetLineValidationError(
                "Product is not available in this project's template"
            )

        return template_item

    def _resolve_budget_line_name(
        self,
        *,
        template_item: TemplateItem,
        name: str | None,
        item_type: BudgetLineType,
    ) -> str:
        if item_type == BudgetLineType.product:
            return template_item.default_name

        budget_line_name = name.strip() if name is not None else None
        if not budget_line_name:
            raise BudgetLineValidationError('Budget line name is required')

        return budget_line_name

    async def _find_reusable_budget_line(
        self,
        db: AsyncSession,
        *,
        project_id: int,
        product_id: int,
        name: str,
        item_type: BudgetLineType,
    ) -> BudgetLine | None:
        result = await db.execute(
            select(BudgetLine)
            .where(
                BudgetLine.project_id == project_id,
                BudgetLine.product_id == product_id,
                BudgetLine.deleted_at.is_(None),
            )
            .order_by(BudgetLine.id)
        )
        existing_lines = list(result.scalars().all())

        if not existing_lines:
            return None

        if item_type == BudgetLineType.product:
            product_lines = [
                line for line in existing_lines if line.item_type == BudgetLineType.product
            ]
            if len(product_lines) == 1:
                return product_lines[0]
        else:
            matching_lines = [
                line
                for line in existing_lines
                if line.item_type == BudgetLineType.breakdown
                and self._normalize_name_key(line.name)
                == self._normalize_name_key(name)
            ]
            if matching_lines:
                return matching_lines[0]
            if all(line.item_type == BudgetLineType.breakdown for line in existing_lines):
                return None

        raise BudgetLineValidationError(
            'A project product must use either one whole-product budget item or '
            'multiple breakdown items, not both'
        )


budget_line_service = BudgetLineService()
