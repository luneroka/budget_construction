from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget_line import BudgetLine, BudgetLineType
from app.models.category import Category
from app.models.product import Product
from app.models.project import Project
from app.models.subcategory import Subcategory
from app.models.template_item import TemplateItem
from app.repositories.budget_line import BudgetLineValidationError


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

        await self._validate_item_mode(
            db,
            project_id=project_id,
            product_id=product_id,
            item_type=item_type,
        )

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

    async def _find_template_item_for_project_product(
        self,
        db: AsyncSession,
        *,
        project: Project,
        product_id: int,
    ) -> TemplateItem:
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
                if line.item_type == BudgetLineType.breakdown and line.name == name
            ]
            if matching_lines:
                return matching_lines[0]
            if all(line.item_type == BudgetLineType.breakdown for line in existing_lines):
                return None

        raise BudgetLineValidationError(
            'A project product must use either one whole-product budget item or '
            'multiple breakdown items, not both'
        )

    async def _validate_item_mode(
        self,
        db: AsyncSession,
        *,
        project_id: int,
        product_id: int,
        item_type: BudgetLineType,
    ) -> None:
        query = select(BudgetLine.item_type).where(
            BudgetLine.project_id == project_id,
            BudgetLine.product_id == product_id,
            BudgetLine.deleted_at.is_(None),
        )
        if item_type == BudgetLineType.breakdown:
            query = query.where(BudgetLine.item_type == BudgetLineType.product)
        query = query.limit(1)

        result = await db.execute(query)
        if result.scalar_one_or_none() is not None:
            raise BudgetLineValidationError(
                'A project product must use either one whole-product budget item or '
                'multiple breakdown items, not both'
            )


budget_line_service = BudgetLineService()
