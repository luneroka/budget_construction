from dataclasses import dataclass
from typing import cast

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.category import Category
from app.models.product import Product
from app.models.project import Project
from app.models.subcategory import Subcategory
from app.models.template import Template
from app.models.template_item import TemplateItem
from app.models.user import User


@dataclass(frozen=True)
class BudgetLineRouteContext:
    access_token: str
    project_id: int
    product_id: int


async def create_budget_line_route_context(
    db_session: AsyncSession,
    *,
    email: str = 'budget-line-route-user@example.com',
) -> BudgetLineRouteContext:
    user = User(
        name='Budget Line Route User',
        email=email,
        hashed_password='hashed-password',
    )
    category = Category(name=f'Category {email}')
    subcategory = Subcategory(category=category, name=f'Subcategory {email}')
    product = Product(subcategory=subcategory, name=f'Product {email}')
    template = Template(name=f'Template {email}')
    TemplateItem(
        template=template,
        product=product,
        default_name='Product budget',
        sort_order=10,
    )
    project = Project(
        user=user,
        template=template,
        name=f'Project {email}',
    )

    db_session.add_all([user, category, subcategory, product, template, project])
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(project)
    await db_session.refresh(product)

    return BudgetLineRouteContext(
        access_token=create_access_token(subject=str(user.id)),
        project_id=project.id,
        product_id=product.id,
    )


def auth_headers(access_token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {access_token}'}


async def create_budget_line(
    client: AsyncClient,
    context: BudgetLineRouteContext,
    *,
    name: str,
    item_type: str,
) -> dict[str, object]:
    response = await client.post(
        f'/projects/{context.project_id}/budget-lines/',
        headers=auth_headers(context.access_token),
        json={
            'product_id': context.product_id,
            'name': name,
            'item_type': item_type,
            'sort_order': 10,
        },
    )
    assert response.status_code == 201
    return cast(dict[str, object], response.json())


async def test_create_whole_product_budget_line(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_budget_line_route_context(db_session)

    budget_line = await create_budget_line(
        client,
        context,
        name='Whole product budget',
        item_type='product',
    )

    assert isinstance(budget_line['id'], int)
    assert budget_line['project_id'] == context.project_id
    assert budget_line['product_id'] == context.product_id
    assert budget_line['name'] == 'Whole product budget'
    assert budget_line['item_type'] == 'product'


async def test_create_breakdown_budget_line(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_budget_line_route_context(
        db_session,
        email='breakdown-budget-line-route-user@example.com',
    )

    budget_line = await create_budget_line(
        client,
        context,
        name='Foundation labor',
        item_type='breakdown',
    )

    assert isinstance(budget_line['id'], int)
    assert budget_line['project_id'] == context.project_id
    assert budget_line['product_id'] == context.product_id
    assert budget_line['name'] == 'Foundation labor'
    assert budget_line['item_type'] == 'breakdown'


async def test_cannot_mix_budget_line_modes(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_budget_line_route_context(
        db_session,
        email='mixed-budget-line-route-user@example.com',
    )
    await create_budget_line(
        client,
        context,
        name='Whole product budget',
        item_type='product',
    )

    response = await client.post(
        f'/projects/{context.project_id}/budget-lines/',
        headers=auth_headers(context.access_token),
        json={
            'product_id': context.product_id,
            'name': 'Foundation labor',
            'item_type': 'breakdown',
            'sort_order': 20,
        },
    )

    assert response.status_code == 400


async def test_convert_whole_product_to_breakdown(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_budget_line_route_context(
        db_session,
        email='convert-budget-line-route-user@example.com',
    )
    product_line = await create_budget_line(
        client,
        context,
        name='Whole product budget',
        item_type='product',
    )
    product_line_id = product_line['id']
    assert isinstance(product_line_id, int)

    response = await client.post(
        (
            f'/projects/{context.project_id}/products/{context.product_id}'
            '/budget-lines/convert-to-breakdown'
        ),
        headers=auth_headers(context.access_token),
        json={
            'strategy': 'reuse_existing_as_breakdown',
            'existing_line_new_name': 'Foundation labor',
            'new_breakdown_names': ['Materials'],
        },
    )

    assert response.status_code == 201
    budget_lines = cast(list[dict[str, object]], response.json())
    assert [budget_line['name'] for budget_line in budget_lines] == [
        'Foundation labor',
        'Materials',
    ]
    assert {budget_line['item_type'] for budget_line in budget_lines} == {'breakdown'}
    assert product_line_id in {budget_line['id'] for budget_line in budget_lines}


async def test_deleting_final_breakdown_leaves_product_empty(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_budget_line_route_context(
        db_session,
        email='delete-final-breakdown-route-user@example.com',
    )
    first_breakdown = await create_budget_line(
        client,
        context,
        name='Foundation labor',
        item_type='breakdown',
    )
    second_breakdown = await create_budget_line(
        client,
        context,
        name='Materials',
        item_type='breakdown',
    )
    first_breakdown_id = first_breakdown['id']
    second_breakdown_id = second_breakdown['id']
    assert isinstance(first_breakdown_id, int)
    assert isinstance(second_breakdown_id, int)

    response = await client.delete(
        f'/projects/{context.project_id}/budget-lines/{first_breakdown_id}',
        headers=auth_headers(context.access_token),
    )

    assert response.status_code == 200

    response = await client.get(
        f'/projects/{context.project_id}/budget-lines/',
        headers=auth_headers(context.access_token),
    )

    assert response.status_code == 200
    budget_lines = cast(list[dict[str, object]], response.json())
    assert [budget_line['id'] for budget_line in budget_lines] == [
        second_breakdown_id
    ]

    response = await client.delete(
        f'/projects/{context.project_id}/budget-lines/{second_breakdown_id}',
        headers=auth_headers(context.access_token),
    )

    assert response.status_code == 200

    response = await client.get(
        f'/projects/{context.project_id}/financial-summary',
        headers=auth_headers(context.access_token),
    )

    assert response.status_code == 200
    summary = cast(dict[str, object], response.json())
    products = cast(list[dict[str, object]], summary['products'])
    assert len(products) == 1
    assert products[0]['product_id'] == context.product_id
    assert products[0]['budget_lines'] == []
    assert products[0]['selected_budget_amount_ttc'] == '0.00'
    assert products[0]['actual_cost_amount_ttc'] == '0.00'


async def test_foreign_or_missing_project_returns_404(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_budget_line_route_context(
        db_session,
        email='missing-budget-line-project-route-user@example.com',
    )

    response = await client.post(
        f'/projects/{context.project_id + 10_000}/budget-lines/',
        headers=auth_headers(context.access_token),
        json={
            'product_id': context.product_id,
            'name': 'Missing project budget',
            'item_type': 'product',
            'sort_order': 10,
        },
    )

    assert response.status_code == 404
