from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget_line import BudgetLine, BudgetLineType
from app.models.category import Category
from app.models.product import Product
from app.models.project import Project
from app.models.subcategory import Subcategory
from app.models.template import Template
from app.models.template_item import TemplateItem
from app.models.transaction import QuoteStatus, Transaction, TransactionType
from app.models.user import User
from app.repositories.budget_line import BudgetLineValidationError
from app.schemas.budget_line import (
    ProductLineConversionStrategy,
    ProductLineConvertToBreakdown,
)
from app.services.budget_line import budget_line_service


async def create_project_template_product(
    db_session: AsyncSession,
) -> tuple[User, Project, Product, TemplateItem]:
    user = User(
        name='Budget Mode User',
        email='budget-mode-user@example.com',
        hashed_password='hashed-password',
    )
    category = Category(name='Structure', sort_order=1)
    subcategory = Subcategory(category=category, name='Concrete', sort_order=1)
    product = Product(subcategory=subcategory, name='Ready-mix concrete', sort_order=1)
    template = Template(name='Budget Mode Template')
    template_item = TemplateItem(
        template=template,
        product=product,
        default_name='Concrete budget',
        sort_order=30,
    )
    project = Project(
        user=user,
        template=template,
        name='Budget Mode Project',
    )

    db_session.add_all(
        [user, category, subcategory, product, template, template_item, project]
    )
    await db_session.commit()

    return user, project, product, template_item


async def create_whole_product_line(
    db_session: AsyncSession,
    user: User,
    project: Project,
    product: Product,
) -> BudgetLine:
    budget_line = await budget_line_service.ensure_for_project_product(
        db_session,
        project.id,
        product.id,
        user.id,
        item_type=BudgetLineType.product,
    )
    assert budget_line is not None
    await db_session.commit()
    return budget_line


async def create_breakdown_line(
    db_session: AsyncSession,
    user: User,
    project: Project,
    product: Product,
    name: str,
) -> BudgetLine:
    budget_line = await budget_line_service.ensure_for_project_product(
        db_session,
        project.id,
        product.id,
        user.id,
        name=name,
        item_type=BudgetLineType.breakdown,
    )
    assert budget_line is not None
    await db_session.commit()
    return budget_line


async def create_quote_transaction(
    db_session: AsyncSession,
    budget_line: BudgetLine,
) -> Transaction:
    transaction = Transaction(
        budget_line_id=budget_line.id,
        transaction_type=TransactionType.quote,
        amount_ht=Decimal('100.00'),
        vat_rate=Decimal('20.00'),
        amount_vat=Decimal('20.00'),
        amount_ttc=Decimal('120.00'),
        issued_date=date(2026, 6, 16),
        quote_status=QuoteStatus.validated,
    )
    db_session.add(transaction)
    await db_session.commit()
    return transaction


async def get_active_budget_lines(db_session: AsyncSession) -> list[BudgetLine]:
    result = await db_session.execute(
        select(BudgetLine)
        .where(BudgetLine.deleted_at.is_(None))
        .order_by(BudgetLine.id)
    )
    return list(result.scalars().all())


async def get_all_budget_lines(db_session: AsyncSession) -> list[BudgetLine]:
    result = await db_session.execute(select(BudgetLine).order_by(BudgetLine.id))
    return list(result.scalars().all())


async def test_breakdown_line_rejected_when_whole_product_line_exists(
    db_session: AsyncSession,
) -> None:
    user, project, product, _ = await create_project_template_product(db_session)
    await create_whole_product_line(db_session, user, project, product)

    with pytest.raises(
        BudgetLineValidationError,
        match='A project product must use either one whole-product budget item or '
        'multiple breakdown items, not both',
    ):
        await budget_line_service.ensure_for_project_product(
            db_session,
            project.id,
            product.id,
            user.id,
            name='Foundation labor',
            item_type=BudgetLineType.breakdown,
        )

    assert len(await get_active_budget_lines(db_session)) == 1


async def test_whole_product_line_rejected_when_breakdown_line_exists(
    db_session: AsyncSession,
) -> None:
    user, project, product, _ = await create_project_template_product(db_session)
    await create_breakdown_line(db_session, user, project, product, 'Foundation labor')

    with pytest.raises(
        BudgetLineValidationError,
        match='A project product must use either one whole-product budget item or '
        'multiple breakdown items, not both',
    ):
        await budget_line_service.ensure_for_project_product(
            db_session,
            project.id,
            product.id,
            user.id,
            item_type=BudgetLineType.product,
        )

    assert len(await get_active_budget_lines(db_session)) == 1


async def test_archive_conversion_replaces_whole_product_with_breakdowns(
    db_session: AsyncSession,
) -> None:
    user, project, product, template_item = await create_project_template_product(
        db_session
    )
    product_line = await create_whole_product_line(db_session, user, project, product)

    converted_lines = await budget_line_service.convert_product_line_to_breakdown_lines(
        db_session,
        project.id,
        product.id,
        ProductLineConvertToBreakdown(
            strategy=ProductLineConversionStrategy.archive_existing,
            new_breakdown_names=['Foundation labor', ' Materials ', ''],
        ),
        user.id,
    )

    assert converted_lines is not None
    assert [line.name for line in converted_lines] == [
        'Foundation labor',
        'Materials',
    ]
    assert {line.item_type for line in converted_lines} == {BudgetLineType.breakdown}
    assert {line.template_item_id for line in converted_lines} == {template_item.id}
    assert {line.sort_order for line in converted_lines} == {template_item.sort_order}

    all_lines = await get_all_budget_lines(db_session)
    archived_line = next(line for line in all_lines if line.id == product_line.id)
    assert archived_line.deleted_at is not None
    assert len(await get_active_budget_lines(db_session)) == 2


async def test_reuse_conversion_keeps_existing_transactions_on_converted_line(
    db_session: AsyncSession,
) -> None:
    user, project, product, template_item = await create_project_template_product(
        db_session
    )
    product_line = await create_whole_product_line(db_session, user, project, product)
    transaction = await create_quote_transaction(db_session, product_line)

    converted_lines = await budget_line_service.convert_product_line_to_breakdown_lines(
        db_session,
        project.id,
        product.id,
        ProductLineConvertToBreakdown(
            strategy=ProductLineConversionStrategy.reuse_existing_as_breakdown,
            existing_line_new_name='Foundation labor',
            new_breakdown_names=['Materials'],
        ),
        user.id,
    )

    assert converted_lines is not None
    assert [line.name for line in converted_lines] == [
        'Foundation labor',
        'Materials',
    ]

    converted_existing_line = next(
        line for line in converted_lines if line.id == product_line.id
    )
    assert converted_existing_line.item_type == BudgetLineType.breakdown
    assert converted_existing_line.deleted_at is None
    assert converted_existing_line.template_item_id == template_item.id

    await db_session.refresh(transaction)
    assert transaction.budget_line_id == converted_existing_line.id


async def test_conversion_requires_strategy_when_whole_product_line_has_transactions(
    db_session: AsyncSession,
) -> None:
    user, project, product, _ = await create_project_template_product(db_session)
    product_line = await create_whole_product_line(db_session, user, project, product)
    await create_quote_transaction(db_session, product_line)

    with pytest.raises(
        BudgetLineValidationError,
        match='Conversion strategy is required when the budget line has transactions',
    ):
        await budget_line_service.convert_product_line_to_breakdown_lines(
            db_session,
            project.id,
            product.id,
            ProductLineConvertToBreakdown(new_breakdown_names=['Foundation labor']),
            user.id,
        )

    active_lines = await get_active_budget_lines(db_session)
    assert len(active_lines) == 1
    assert active_lines[0].item_type == BudgetLineType.product


async def test_conversion_rejects_duplicate_breakdown_names(
    db_session: AsyncSession,
) -> None:
    user, project, product, _ = await create_project_template_product(db_session)
    await create_whole_product_line(db_session, user, project, product)

    with pytest.raises(
        BudgetLineValidationError,
        match='Breakdown names must be unique',
    ):
        await budget_line_service.convert_product_line_to_breakdown_lines(
            db_session,
            project.id,
            product.id,
            ProductLineConvertToBreakdown(
                strategy=ProductLineConversionStrategy.archive_existing,
                new_breakdown_names=['Foundation labor', ' foundation labor '],
            ),
            user.id,
        )

    active_lines = await get_active_budget_lines(db_session)
    assert len(active_lines) == 1
    assert active_lines[0].item_type == BudgetLineType.product
