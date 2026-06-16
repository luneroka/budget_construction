from collections.abc import Sequence

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget_line import BudgetLine
from app.models.category import Category
from app.models.product import Product
from app.models.project import Project
from app.models.subcategory import Subcategory
from app.models.template import Template
from app.models.template_item import TemplateItem
from app.models.user import User
from app.repositories.budget_line import BudgetLineValidationError
from app.repositories.template_item import (
    TemplateItemValidationError,
    create_template_item,
)
from app.schemas.project import ProjectFromTemplateCreate
from app.schemas.template_item import TemplateItemCreate
from app.services.generate_project import generate_project_from_template


async def create_user(db_session: AsyncSession) -> User:
    user = User(
        name='Template User',
        email='template-user@example.com',
        hashed_password='hashed-password',
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def create_template_with_products(
    db_session: AsyncSession,
    *,
    template_name: str = 'House Template',
    product_names: Sequence[str] = ('Concrete', 'Windows', 'Paint'),
    inactive_product_index: int | None = None,
) -> tuple[Template, list[Product], list[TemplateItem]]:
    category = Category(name=f'{template_name} Category', sort_order=1)
    subcategory = Subcategory(
        category=category,
        name=f'{template_name} Subcategory',
        sort_order=1,
    )
    template = Template(name=template_name, description='Integration template')
    db_session.add_all([category, subcategory, template])
    await db_session.flush()

    products: list[Product] = []
    template_items: list[TemplateItem] = []
    for index, product_name in enumerate(product_names):
        product = Product(
            subcategory=subcategory,
            name=product_name,
            sort_order=index + 1,
            is_active=index != inactive_product_index,
        )
        products.append(product)
        db_session.add(product)
        await db_session.flush()

        template_item = TemplateItem(
            template=template,
            product=product,
            default_name=f'{product_name} budget',
            sort_order=(index + 1) * 10,
        )
        template_items.append(template_item)
        db_session.add(template_item)

    await db_session.commit()
    return template, products, template_items


async def get_projects(db_session: AsyncSession) -> list[Project]:
    result = await db_session.execute(select(Project).order_by(Project.id))
    return list(result.scalars().all())


async def get_budget_lines(db_session: AsyncSession) -> list[BudgetLine]:
    result = await db_session.execute(
        select(BudgetLine).order_by(BudgetLine.sort_order)
    )
    return list(result.scalars().all())


async def test_template_generates_project_without_eager_budget_lines(
    db_session: AsyncSession,
) -> None:
    user = await create_user(db_session)
    template, _, template_items = await create_template_with_products(
        db_session,
        product_names=('Concrete', 'Windows', 'Paint'),
    )

    generated = await generate_project_from_template(
        db_session,
        ProjectFromTemplateCreate(
            name='Renovation',
            template_id=template.id,
        ),
        user.id,
    )

    assert generated.project.name == 'Renovation'
    assert generated.project.user_id == user.id
    assert generated.project.template_id == template.id

    projects = await get_projects(db_session)
    assert len(projects) == 1

    assert len(template_items) == 3
    assert generated.budget_lines == []
    assert await get_budget_lines(db_session) == []


async def test_inactive_template_raises_expected_error_and_rolls_back_project(
    db_session: AsyncSession,
) -> None:
    user = await create_user(db_session)
    template, _, _ = await create_template_with_products(db_session)
    template.is_active = False
    await db_session.commit()

    with pytest.raises(
        BudgetLineValidationError,
        match='Template not found or inactive',
    ):
        await generate_project_from_template(
            db_session,
            ProjectFromTemplateCreate(
                name='Should Roll Back',
                template_id=template.id,
            ),
            user.id,
        )

    assert await get_projects(db_session) == []
    assert await get_budget_lines(db_session) == []


async def test_duplicate_template_product_is_rejected_before_generation(
    db_session: AsyncSession,
) -> None:
    template, products, _ = await create_template_with_products(
        db_session,
        product_names=('Concrete',),
    )

    with pytest.raises(
        TemplateItemValidationError,
        match='A template cannot contain the same product more than once',
    ):
        await create_template_item(
            db_session,
            template.id,
            TemplateItemCreate(
                product_id=products[0].id,
                default_name='Duplicate concrete budget',
                sort_order=20,
            ),
        )

    assert await get_budget_lines(db_session) == []


async def test_generation_rolls_back_when_template_item_is_invalid_midway(
    db_session: AsyncSession,
) -> None:
    user = await create_user(db_session)
    template, products, _ = await create_template_with_products(
        db_session,
        inactive_product_index=1,
    )

    with pytest.raises(
        BudgetLineValidationError,
        match=f'Product {products[1].id} not found or inactive',
    ):
        await generate_project_from_template(
            db_session,
            ProjectFromTemplateCreate(
                name='Invalid Template Project',
                template_id=template.id,
            ),
            user.id,
        )

    assert await get_projects(db_session) == []
    assert await get_budget_lines(db_session) == []
