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
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.repositories.budget_line import BudgetLineValidationError
from app.schemas.transaction import BudgetConcern, TransactionCreateForProduct
from app.services.transaction import transaction_service


async def create_project_template_product(
    db_session: AsyncSession,
    *,
    default_budget_line_name: str = 'Concrete budget',
) -> tuple[User, Project, Product, TemplateItem]:
    user = User(
        name='Transaction User',
        email='transaction-user@example.com',
        hashed_password='hashed-password',
    )
    category = Category(name='Structure', sort_order=1)
    subcategory = Subcategory(category=category, name='Concrete', sort_order=1)
    product = Product(subcategory=subcategory, name='Ready-mix concrete', sort_order=1)
    template = Template(name='Transaction Template')
    template_item = TemplateItem(
        template=template,
        product=product,
        default_name=default_budget_line_name,
        sort_order=30,
    )
    project = Project(
        user=user,
        template=template,
        name='Transaction Project',
    )

    db_session.add_all(
        [user, category, subcategory, product, template, template_item, project]
    )
    await db_session.commit()

    return user, project, product, template_item


def quote_for_product(
    budget_concern: BudgetConcern,
    *,
    budget_line_name: str | None = None,
) -> TransactionCreateForProduct:
    return TransactionCreateForProduct(
        transaction_type=TransactionType.quote,
        amount_ht=Decimal('100.00'),
        vat_rate=Decimal('20.00'),
        issued_date=date(2026, 6, 16),
        budget_concern=budget_concern,
        budget_line_name=budget_line_name,
    )


def invoice_for_product() -> TransactionCreateForProduct:
    return TransactionCreateForProduct(
        transaction_type=TransactionType.invoice,
        amount_ht=Decimal('100.00'),
        vat_rate=Decimal('20.00'),
        issued_date=date(2026, 6, 16),
    )


async def get_budget_lines(db_session: AsyncSession) -> list[BudgetLine]:
    result = await db_session.execute(select(BudgetLine).order_by(BudgetLine.id))
    return list(result.scalars().all())


async def get_transactions(db_session: AsyncSession) -> list[Transaction]:
    result = await db_session.execute(select(Transaction).order_by(Transaction.id))
    return list(result.scalars().all())


async def test_quote_entire_product_creates_whole_product_budget_line(
    db_session: AsyncSession,
) -> None:
    user, project, product, template_item = await create_project_template_product(
        db_session,
    )

    transaction = await transaction_service.create_for_product(
        db_session,
        project.id,
        product.id,
        quote_for_product(BudgetConcern.entire_product),
        user.id,
    )

    assert transaction is not None

    budget_lines = await get_budget_lines(db_session)
    assert len(budget_lines) == 1

    budget_line = budget_lines[0]
    assert budget_line.project_id == project.id
    assert budget_line.template_item_id == template_item.id
    assert budget_line.product_id == product.id
    assert budget_line.name == template_item.default_name
    assert budget_line.item_type == BudgetLineType.product
    assert budget_line.sort_order == template_item.sort_order
    assert transaction.budget_line_id == budget_line.id


async def test_quote_breakdown_creates_breakdown_budget_line(
    db_session: AsyncSession,
) -> None:
    user, project, product, template_item = await create_project_template_product(
        db_session,
    )

    transaction = await transaction_service.create_for_product(
        db_session,
        project.id,
        product.id,
        quote_for_product(
            BudgetConcern.specific_element,
            budget_line_name='Foundation labor',
        ),
        user.id,
    )

    assert transaction is not None

    budget_lines = await get_budget_lines(db_session)
    assert len(budget_lines) == 1

    budget_line = budget_lines[0]
    assert budget_line.project_id == project.id
    assert budget_line.template_item_id == template_item.id
    assert budget_line.product_id == product.id
    assert budget_line.name == 'Foundation labor'
    assert budget_line.item_type == BudgetLineType.breakdown
    assert budget_line.sort_order == template_item.sort_order
    assert transaction.budget_line_id == budget_line.id


async def test_invoice_creates_and_reuses_whole_product_budget_line(
    db_session: AsyncSession,
) -> None:
    user, project, product, template_item = await create_project_template_product(
        db_session,
    )

    first_invoice = await transaction_service.create_for_product(
        db_session,
        project.id,
        product.id,
        invoice_for_product(),
        user.id,
    )
    second_invoice = await transaction_service.create_for_product(
        db_session,
        project.id,
        product.id,
        invoice_for_product(),
        user.id,
    )

    assert first_invoice is not None
    assert second_invoice is not None

    budget_lines = await get_budget_lines(db_session)
    assert len(budget_lines) == 1

    budget_line = budget_lines[0]
    assert budget_line.project_id == project.id
    assert budget_line.template_item_id == template_item.id
    assert budget_line.product_id == product.id
    assert budget_line.name == template_item.default_name
    assert budget_line.item_type == BudgetLineType.product
    assert first_invoice.budget_line_id == budget_line.id
    assert second_invoice.budget_line_id == budget_line.id

    transactions = await get_transactions(db_session)
    assert len(transactions) == 2
    assert {transaction.budget_line_id for transaction in transactions} == {
        budget_line.id
    }


async def test_invoice_rejects_ambiguous_active_budget_lines_for_product(
    db_session: AsyncSession,
) -> None:
    user, project, product, _ = await create_project_template_product(db_session)

    first_quote = await transaction_service.create_for_product(
        db_session,
        project.id,
        product.id,
        quote_for_product(
            BudgetConcern.specific_element,
            budget_line_name='Foundation labor',
        ),
        user.id,
    )
    second_quote = await transaction_service.create_for_product(
        db_session,
        project.id,
        product.id,
        quote_for_product(
            BudgetConcern.specific_element,
            budget_line_name='Foundation materials',
        ),
        user.id,
    )

    assert first_quote is not None
    assert second_quote is not None
    assert len(await get_budget_lines(db_session)) == 2

    with pytest.raises(
        BudgetLineValidationError,
        match='Select a specific budget line for this product transaction',
    ):
        await transaction_service.create_for_product(
            db_session,
            project.id,
            product.id,
            invoice_for_product(),
            user.id,
        )

    transactions = await get_transactions(db_session)
    assert len(transactions) == 2
    assert {transaction.transaction_type for transaction in transactions} == {
        TransactionType.quote
    }
