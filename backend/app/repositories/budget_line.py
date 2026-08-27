
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.project import Project
from app.models.budget_line import BudgetLine, BudgetLineType
from app.models.template import Template
from app.models.template_item import TemplateItem
from app.models.transaction import Transaction
from app.repositories.common import (
    get_active_product,
    get_active_project,
    with_product_hierarchy,
)
from app.schemas.budget_line import BudgetLineCreate, BudgetLineUpdate
from app.core.time import utcnow


class BudgetLineValidationError(ValueError):
    pass


async def get_budget_line_by_id(
    db: AsyncSession,
    project_id: int,
    budget_line_id: int,
    user_id: int,
) -> BudgetLine | None:
    result = await db.execute(
        select(BudgetLine)
        .options(with_product_hierarchy(BudgetLine.product))
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
    if await get_active_project(db, project_id, user_id) is None:
        return None

    result = await db.execute(
        select(BudgetLine)
        .options(with_product_hierarchy(BudgetLine.product))
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


async def attach_template(
    db: AsyncSession,
    project_id: int,
    template_id: int,
    user_id: int,
) -> list[BudgetLine] | None:
    project = await get_active_project(db, project_id, user_id)
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
        .options(with_product_hierarchy(TemplateItem.product))
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
            raise BudgetLineValidationError('Product not found or inactive')
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
    project = await get_active_project(db, project_id, user_id)
    if project is None:
        return None

    if await get_active_product(db, budget_line_create.product_id) is None:
        raise BudgetLineValidationError('Product not found or inactive')

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
        raise BudgetLineValidationError('Budget line type is required')
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

    deleted_at = utcnow()

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
