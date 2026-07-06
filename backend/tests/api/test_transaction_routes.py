from dataclasses import dataclass
from typing import cast

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.budget_line import BudgetLine
from app.models.category import Category
from app.models.product import Product
from app.models.project import Project
from app.models.subcategory import Subcategory
from app.models.template import Template
from app.models.template_item import TemplateItem
from app.models.user import User


@dataclass(frozen=True)
class TransactionRouteContext:
    access_token: str
    project_id: int
    product_id: int


async def create_transaction_route_context(
    db_session: AsyncSession,
    *,
    email: str = 'transaction-route-user@example.com',
) -> TransactionRouteContext:
    user = User(
        name='Transaction Route User',
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
        default_name='Whole product budget',
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

    return TransactionRouteContext(
        access_token=create_access_token(subject=str(user.id)),
        project_id=project.id,
        product_id=product.id,
    )


def auth_headers(access_token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {access_token}'}


def quote_payload(*, quote_status: str = 'to_confirm') -> dict[str, object]:
    return {
        'transaction_type': 'quote',
        'amount_ht': '100.00',
        'vat_rate': '20.00',
        'issued_date': '2026-06-16',
        'quote_status': quote_status,
        'budget_concern': 'entire_product',
    }


def invoice_payload() -> dict[str, object]:
    return {
        'transaction_type': 'invoice',
        'amount_ht': '120.00',
        'vat_rate': '20.00',
        'issued_date': '2026-06-20',
    }


def diy_estimate_payload() -> dict[str, object]:
    return {
        'transaction_type': 'diy_estimate',
        'amount_ht': '50.00',
        'vat_rate': '20.00',
        'issued_date': '2026-06-18',
        'budget_concern': 'entire_product',
    }


async def create_product_transaction(
    client: AsyncClient,
    context: TransactionRouteContext,
    payload: dict[str, object],
) -> dict[str, object]:
    response = await client.post(
        f'/projects/{context.project_id}/products/{context.product_id}/transactions/',
        headers=auth_headers(context.access_token),
        json=payload,
    )
    assert response.status_code == 201
    return cast(dict[str, object], response.json())


async def get_budget_line(
    db_session: AsyncSession,
    budget_line_id: int,
) -> BudgetLine:
    result = await db_session.execute(
        select(BudgetLine).where(BudgetLine.id == budget_line_id)
    )
    budget_line = result.scalar_one()
    return budget_line


async def test_create_quote_for_product(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(db_session)

    transaction = await create_product_transaction(
        client,
        context,
        quote_payload(quote_status='validated'),
    )

    assert isinstance(transaction['id'], int)
    assert isinstance(transaction['budget_line_id'], int)
    assert transaction['transaction_type'] == 'quote'
    assert transaction['quote_status'] == 'validated'
    assert transaction['amount_ht'] == '100.00'
    assert transaction['amount_ttc'] == '120.00'


async def test_create_invoice_for_product(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(
        db_session,
        email='invoice-transaction-route-user@example.com',
    )

    transaction = await create_product_transaction(
        client,
        context,
        invoice_payload(),
    )

    assert isinstance(transaction['id'], int)
    assert isinstance(transaction['budget_line_id'], int)
    assert transaction['transaction_type'] == 'invoice'
    assert transaction['invoice_status'] == 'unpaid'
    assert transaction['invoice_type'] == 'full'
    assert transaction['amount_ht'] == '120.00'
    assert transaction['amount_ttc'] == '144.00'


async def test_select_budget_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(
        db_session,
        email='select-budget-candidate-user@example.com',
    )
    transaction = await create_product_transaction(
        client,
        context,
        quote_payload(quote_status='validated'),
    )
    transaction_id = transaction['id']
    budget_line_id = transaction['budget_line_id']
    assert isinstance(transaction_id, int)
    assert isinstance(budget_line_id, int)

    response = await client.post(
        (
            f'/projects/{context.project_id}/budget-lines/{budget_line_id}'
            f'/transactions/{transaction_id}/select-budget'
        ),
        headers=auth_headers(context.access_token),
    )

    assert response.status_code == 200
    selected_transaction = cast(dict[str, object], response.json())
    assert selected_transaction['id'] == transaction_id

    budget_line = await get_budget_line(db_session, budget_line_id)
    assert budget_line.selected_quote_transaction_id == transaction_id


async def test_select_budget_candidate_keeps_quote_and_diy_selections(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(
        db_session,
        email='composite-select-budget-candidate-user@example.com',
    )
    quote = await create_product_transaction(
        client,
        context,
        quote_payload(quote_status='validated'),
    )
    diy_estimate = await create_product_transaction(
        client,
        context,
        diy_estimate_payload(),
    )
    replacement_quote = await create_product_transaction(
        client,
        context,
        {
            **quote_payload(quote_status='validated'),
            'amount_ht': '200.00',
        },
    )

    budget_line_id = quote['budget_line_id']
    quote_id = quote['id']
    diy_estimate_id = diy_estimate['id']
    replacement_quote_id = replacement_quote['id']
    assert isinstance(budget_line_id, int)
    assert isinstance(quote_id, int)
    assert isinstance(diy_estimate_id, int)
    assert isinstance(replacement_quote_id, int)

    for transaction_id in [quote_id, diy_estimate_id, replacement_quote_id]:
        response = await client.post(
            (
                f'/projects/{context.project_id}/budget-lines/{budget_line_id}'
                f'/transactions/{transaction_id}/select-budget'
            ),
            headers=auth_headers(context.access_token),
        )
        assert response.status_code == 200

    budget_line = await get_budget_line(db_session, budget_line_id)
    assert budget_line.selected_quote_transaction_id == replacement_quote_id
    assert budget_line.selected_diy_estimate_transaction_id == diy_estimate_id


async def test_invalid_selected_candidate_returns_400(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(
        db_session,
        email='invalid-selected-candidate-user@example.com',
    )
    transaction = await create_product_transaction(
        client,
        context,
        quote_payload(quote_status='to_confirm'),
    )
    transaction_id = transaction['id']
    budget_line_id = transaction['budget_line_id']
    assert isinstance(transaction_id, int)
    assert isinstance(budget_line_id, int)

    response = await client.post(
        (
            f'/projects/{context.project_id}/budget-lines/{budget_line_id}'
            f'/transactions/{transaction_id}/select-budget'
        ),
        headers=auth_headers(context.access_token),
    )

    assert response.status_code == 400


async def test_invoice_cannot_be_selected_as_budget_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(
        db_session,
        email='invoice-select-budget-candidate-user@example.com',
    )
    transaction = await create_product_transaction(
        client,
        context,
        invoice_payload(),
    )
    transaction_id = transaction['id']
    budget_line_id = transaction['budget_line_id']
    assert isinstance(transaction_id, int)
    assert isinstance(budget_line_id, int)

    response = await client.post(
        (
            f'/projects/{context.project_id}/budget-lines/{budget_line_id}'
            f'/transactions/{transaction_id}/select-budget'
        ),
        headers=auth_headers(context.access_token),
    )

    assert response.status_code == 400


async def test_missing_or_invalid_project_or_budget_line_returns_404(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(
        db_session,
        email='missing-transaction-route-target-user@example.com',
    )
    transaction = await create_product_transaction(
        client,
        context,
        quote_payload(quote_status='validated'),
    )
    budget_line_id = transaction['budget_line_id']
    assert isinstance(budget_line_id, int)

    missing_project_response = await client.post(
        f'/projects/{context.project_id + 10_000}/products/{context.product_id}/transactions/',
        headers=auth_headers(context.access_token),
        json=invoice_payload(),
    )
    missing_budget_line_response = await client.get(
        f'/projects/{context.project_id}/budget-lines/{budget_line_id + 10_000}/transactions/',
        headers=auth_headers(context.access_token),
    )

    assert missing_project_response.status_code == 404
    assert missing_budget_line_response.status_code == 404
