from dataclasses import dataclass
from typing import cast

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.category import Category
from app.models.product import Product
from app.models.subcategory import Subcategory
from app.models.template import Template
from app.models.template_item import TemplateItem
from app.models.user import User


@dataclass(frozen=True)
class TemplateRouteContext:
    access_token: str
    template_id: int


async def create_template_route_context(
    db_session: AsyncSession,
    *,
    email: str = 'template-route-user@example.com',
    template_active: bool = True,
) -> TemplateRouteContext:
    user = User(
        name='Template Route User',
        email=email,
        hashed_password='hashed-password',
    )
    category = Category(name=f'Category {email}')
    subcategory = Subcategory(category=category, name=f'Subcategory {email}')
    product = Product(subcategory=subcategory, name=f'Product {email}')
    template = Template(name=f'Template {email}', is_active=template_active)
    TemplateItem(
        template=template,
        product=product,
        default_name='Template product budget',
        sort_order=10,
    )

    db_session.add_all([user, category, subcategory, product, template])
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(template)

    return TemplateRouteContext(
        access_token=create_access_token(subject=str(user.id)),
        template_id=template.id,
    )


def auth_headers(access_token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {access_token}'}


async def test_generate_project_from_template_returns_201_with_lazy_budget_lines(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_template_route_context(db_session)

    response = await client.post(
        '/projects/from-template',
        headers=auth_headers(context.access_token),
        json={
            'name': 'Generated Project',
            'template_id': context.template_id,
        },
    )

    assert response.status_code == 201
    payload = cast(dict[str, object], response.json())
    project = cast(dict[str, object], payload['project'])
    budget_lines = cast(list[dict[str, object]], payload['budget_lines'])

    assert project['name'] == 'Generated Project'
    assert project['template_id'] == context.template_id
    assert budget_lines == []


@pytest.mark.parametrize('template_id_offset', [0, 10_000])
async def test_inactive_or_invalid_template_returns_400(
    client: AsyncClient,
    db_session: AsyncSession,
    template_id_offset: int,
) -> None:
    context = await create_template_route_context(
        db_session,
        email=f'invalid-template-route-user-{template_id_offset}@example.com',
        template_active=False,
    )

    response = await client.post(
        '/projects/from-template',
        headers=auth_headers(context.access_token),
        json={
            'name': 'Invalid Template Project',
            'template_id': context.template_id + template_id_offset,
        },
    )

    assert response.status_code == 400
