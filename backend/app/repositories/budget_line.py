from datetime import datetime, UTC

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.category import Category
from app.models.document import Document
from app.models.product import Product
from app.models.project import Project
from app.models.budget_line import BudgetLine, BudgetLineType
from app.models.template import Template
from app.models.template_item import TemplateItem
from app.models.transaction import Transaction
from app.models.subcategory import Subcategory
from app.schemas.budget_line import BudgetLineCreate, BudgetLineUpdate


class BudgetLineValidationError(ValueError):
    pass


def _with_product_hierarchy():
    return (
        joinedload(BudgetLine.product)
        .joinedload(Product.subcategory)
        .joinedload(Subcategory.category)
    )


async def _get_active_project(
    db: AsyncSession, project_id: int, user_id: int
) -> Project | None:
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )

    return result.scalar_one_or_none()


async def _get_active_product(db: AsyncSession, product_id: int) -> Product | None:
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


async def get_budget_line_by_id(
    db: AsyncSession,
    project_id: int,
    budget_line_id: int,
    user_id: int,
) -> BudgetLine | None:
    result = await db.execute(
        select(BudgetLine)
        .options(_with_product_hierarchy())
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


async def get_budget_lines(
    db: AsyncSession,
    project_id: int,
    user_id: int,
) -> list[BudgetLine] | None:
    if await _get_active_project(db, project_id, user_id) is None:
        return None

    result = await db.execute(
        select(BudgetLine)
        .options(_with_product_hierarchy())
        .where(
            BudgetLine.project_id == project_id,
            BudgetLine.deleted_at.is_(None),
        )
        .order_by(
            BudgetLine.sort_order,
            BudgetLine.id,
        )
    )

    return list(result.scalars().all())


async def load_template(
    db: AsyncSession,
    project_id: int,
    template_id: int,
    user_id: int,
) -> list[BudgetLine] | None:
    project = await _get_active_project(db, project_id, user_id)
    if project is None:
        return None
    if project.template_id is not None:
        raise BudgetLineValidationError(
            'This project already has an associated template'
        )

    result = await db.execute(
        select(Template).where(
            Template.id == template_id,
            Template.is_active.is_(True),
        )
    )
    if result.scalar_one_or_none() is None:
        raise BudgetLineValidationError('Template not found or inactive')

    result = await db.execute(
        select(TemplateItem)
        .options(
            joinedload(TemplateItem.product)
            .joinedload(Product.subcategory)
            .joinedload(Subcategory.category)
        )
        .where(TemplateItem.template_id == template_id)
        .order_by(
            TemplateItem.sort_order,
            TemplateItem.id,
        )
    )
    template_items = list(result.scalars().all())
    product_ids: set[int] = set()

    for template_item in template_items:
        product = template_item.product
        if (
            not product.is_active
            or not product.subcategory.is_active
            or not product.subcategory.category.is_active
        ):
            raise BudgetLineValidationError(
                f'Product {template_item.product_id} not found or inactive'
            )
        if template_item.product_id in product_ids:
            raise BudgetLineValidationError(
                'A template cannot create more than one whole-product item '
                'for the same product'
            )
        product_ids.add(template_item.product_id)

    project.template_id = template_id
    await db.commit()

    budget_lines = await get_budget_lines(db, project_id, user_id)
    assert budget_lines is not None

    return budget_lines


async def _validate_item_mode(
    db: AsyncSession,
    *,
    project_id: int,
    product_id: int,
    item_type: BudgetLineType,
    budget_line_id: int | None = None,
) -> None:
    query = select(BudgetLine.item_type).where(
        BudgetLine.project_id == project_id,
        BudgetLine.product_id == product_id,
        BudgetLine.deleted_at.is_(None),
    )
    if budget_line_id is not None:
        query = query.where(BudgetLine.id != budget_line_id)
    if item_type == BudgetLineType.breakdown:
        query = query.where(BudgetLine.item_type == BudgetLineType.product)
    query = query.limit(1)

    result = await db.execute(query)
    if result.scalar_one_or_none() is not None:
        raise BudgetLineValidationError(
            'A project product must use either one whole-product budget item or '
            'multiple breakdown items, not both'
        )


async def create_budget_line(
    db: AsyncSession,
    project_id: int,
    budget_line_create: BudgetLineCreate,
    user_id: int,
) -> BudgetLine | None:
    project = await _get_active_project(db, project_id, user_id)
    if project is None:
        return None

    if await _get_active_product(db, budget_line_create.product_id) is None:
        raise BudgetLineValidationError('Product not found')

    template_item = await find_template_item_for_project_product(
        db,
        project=project,
        product_id=budget_line_create.product_id,
    )

    await _validate_item_mode(
        db,
        project_id=project_id,
        product_id=budget_line_create.product_id,
        item_type=budget_line_create.item_type,
    )

    budget_line = BudgetLine(
        **budget_line_create.model_dump(),
        project_id=project_id,
        template_item_id=template_item.id,
    )
    db.add(budget_line)
    await db.commit()

    return await get_budget_line_by_id(db, project_id, budget_line.id, user_id)


async def find_template_item_for_project_product(
    db: AsyncSession,
    *,
    project: Project,
    product_id: int,
) -> TemplateItem:
    if project.template_id is None:
        raise BudgetLineValidationError('Project has no template loaded')

    result = await db.execute(
        select(TemplateItem).where(
            TemplateItem.template_id == project.template_id,
            TemplateItem.product_id == product_id,
        )
    )
    template_item = result.scalar_one_or_none()
    if template_item is None:
        raise BudgetLineValidationError('Product is not part of project template')

    return template_item


async def get_or_create_budget_line_for_product(
    db: AsyncSession,
    project_id: int,
    product_id: int,
    user_id: int,
    *,
    name: str | None = None,
    item_type: BudgetLineType = BudgetLineType.product,
) -> BudgetLine | None:
    project = await _get_active_project(db, project_id, user_id)
    if project is None:
        return None

    product = await _get_active_product(db, product_id)
    if product is None:
        raise BudgetLineValidationError('Product not found')

    template_item = await find_template_item_for_project_product(
        db,
        project=project,
        product_id=product_id,
    )
    if item_type == BudgetLineType.product:
        budget_line_name = template_item.default_name
    else:
        budget_line_name = name.strip() if name is not None else None
        if not budget_line_name:
            raise BudgetLineValidationError('Budget line name is required')

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

    if existing_lines:
        if item_type == BudgetLineType.product:
            product_lines = [
                line
                for line in existing_lines
                if line.item_type == BudgetLineType.product
            ]
            if len(product_lines) == 1:
                return product_lines[0]
        else:
            matching_lines = [
                line
                for line in existing_lines
                if (
                    line.item_type == BudgetLineType.breakdown
                    and line.name == budget_line_name
                )
            ]
            if matching_lines:
                return matching_lines[0]
            if all(
                line.item_type == BudgetLineType.breakdown for line in existing_lines
            ):
                existing_lines = []
            else:
                raise BudgetLineValidationError(
                    'A project product must use either one whole-product budget item '
                    'or multiple breakdown items, not both'
                )

        if existing_lines:
            raise BudgetLineValidationError(
                'A project product must use either one whole-product budget item or '
                'multiple breakdown items, not both'
            )

    budget_line = BudgetLine(
        project_id=project_id,
        template_item_id=template_item.id,
        product_id=product_id,
        name=budget_line_name,
        item_type=item_type,
        sort_order=template_item.sort_order,
    )

    await _validate_item_mode(
        db,
        project_id=project_id,
        product_id=product_id,
        item_type=item_type,
    )
    db.add(budget_line)
    await db.flush()

    return budget_line


async def update_budget_line(
    db: AsyncSession,
    project_id: int,
    budget_line_id: int,
    budget_line_update: BudgetLineUpdate,
    user_id: int,
) -> BudgetLine | None:
    budget_line = await get_budget_line_by_id(db, project_id, budget_line_id, user_id)
    if budget_line is None:
        return None

    update_data = budget_line_update.model_dump(exclude_unset=True)
    if update_data.get('item_type', budget_line.item_type) is None:
        raise BudgetLineValidationError('Budget line type cannot be null')
    item_type = update_data.get('item_type', budget_line.item_type)

    await _validate_item_mode(
        db,
        project_id=project_id,
        product_id=budget_line.product_id,
        item_type=item_type,
        budget_line_id=budget_line.id,
    )

    for field, value in update_data.items():
        setattr(budget_line, field, value)

    await db.commit()

    return await get_budget_line_by_id(db, project_id, budget_line.id, user_id)


async def soft_delete_budget_line(
    db: AsyncSession,
    project_id: int,
    budget_line_id: int,
    user_id: int,
) -> BudgetLine | None:
    budget_line = await get_budget_line_by_id(db, project_id, budget_line_id, user_id)
    if budget_line is None:
        return None

    deleted_at = datetime.now(UTC).replace(tzinfo=None)

    transaction_ids = select(Transaction.id).where(
        Transaction.budget_line_id == budget_line.id,
        Transaction.deleted_at.is_(None),
    )
    try:
        await db.execute(
            update(Document)
            .where(
                Document.transaction_id.in_(transaction_ids),
                Document.deleted_at.is_(None),
            )
            .values(deleted_at=deleted_at, updated_at=deleted_at)
        )
        await db.execute(
            update(Transaction)
            .where(Transaction.id.in_(transaction_ids))
            .values(deleted_at=deleted_at, updated_at=deleted_at)
        )
        budget_line.deleted_at = deleted_at

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return budget_line
