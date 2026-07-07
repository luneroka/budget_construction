from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import cast

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.budget_line import BudgetLine, BudgetLineType
from app.models.category import Category
from app.models.product import Product
from app.models.project import Project
from app.models.subcategory import Subcategory
from app.models.template import Template
from app.models.template_item import TemplateItem
from app.models.transaction import (
    InvoiceStatus,
    InvoiceType,
    QuoteStatus,
    Transaction,
    TransactionType,
)
from app.models.user import User


@dataclass(frozen=True)
class FinancialSummaryRouteContext:
    access_token: str
    project_id: int
    product_id: int
    second_product_id: int
    budget_line_id: int
    second_budget_line_id: int


async def create_financial_summary_context(
    db_session: AsyncSession,
) -> FinancialSummaryRouteContext:
    user = User(
        name='Financial Summary Route User',
        email='financial-summary-route-user@example.com',
        hashed_password='hashed-password',
    )
    category = Category(name='Financial Summary Category')
    subcategory = Subcategory(category=category, name='Financial Summary Subcategory')
    product = Product(subcategory=subcategory, name='Foundations')
    second_product = Product(subcategory=subcategory, name='Windows')
    project = Project(user=user, name='Financial Summary Project')
    budget_line = BudgetLine(
        project=project,
        product=product,
        name='Foundation works',
        item_type=BudgetLineType.product,
        sort_order=10,
    )
    second_budget_line = BudgetLine(
        project=project,
        product=second_product,
        name='Window supply',
        item_type=BudgetLineType.product,
        sort_order=20,
    )

    selected_quote = _quote(
        budget_line,
        amount='1000.00',
        quote_status=QuoteStatus.validated,
    )
    unselected_quote = _quote(
        budget_line,
        amount='1200.00',
        quote_status=QuoteStatus.to_negotiate,
    )
    selected_diy = _transaction(
        second_budget_line,
        transaction_type=TransactionType.diy_estimate,
        amount='300.00',
    )
    selected_foundation_diy = _transaction(
        budget_line,
        transaction_type=TransactionType.diy_estimate,
        amount='150.00',
    )

    db_session.add_all([user, category, subcategory, product, second_product, project])
    await db_session.flush()
    db_session.add_all(
        [
            selected_quote,
            unselected_quote,
            selected_foundation_diy,
            _invoice(
                budget_line,
                amount='100.00',
                invoice_type=InvoiceType.deposit,
                invoice_status=InvoiceStatus.paid,
                payment_date=date(2026, 6, 21),
            ),
            _invoice(
                budget_line,
                amount='250.00',
                invoice_type=InvoiceType.interim,
                invoice_status=InvoiceStatus.unpaid,
            ),
            _invoice(
                budget_line,
                amount='50.00',
                invoice_type=InvoiceType.balance,
                invoice_status=InvoiceStatus.on_hold,
            ),
            _invoice(
                budget_line,
                amount='75.00',
                invoice_type=InvoiceType.full,
                invoice_status=InvoiceStatus.unpaid,
                deleted_at=datetime.now(UTC).replace(tzinfo=None),
            ),
            selected_diy,
            _invoice(
                second_budget_line,
                amount='25.00',
                invoice_type=InvoiceType.full,
                invoice_status=InvoiceStatus.paid,
                payment_date=date(2026, 6, 22),
            ),
        ]
    )
    await db_session.flush()
    budget_line.selected_quote_transaction_id = selected_quote.id
    budget_line.selected_diy_estimate_transaction_id = selected_foundation_diy.id
    second_budget_line.selected_diy_estimate_transaction_id = selected_diy.id
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(project)
    await db_session.refresh(product)
    await db_session.refresh(second_product)
    await db_session.refresh(budget_line)
    await db_session.refresh(second_budget_line)

    return FinancialSummaryRouteContext(
        access_token=create_access_token(subject=str(user.id)),
        project_id=project.id,
        product_id=product.id,
        second_product_id=second_product.id,
        budget_line_id=budget_line.id,
        second_budget_line_id=second_budget_line.id,
    )


def _transaction(
    budget_line: BudgetLine,
    *,
    transaction_type: TransactionType,
    amount: str,
) -> Transaction:
    amount_decimal = Decimal(amount)
    return Transaction(
        budget_line=budget_line,
        transaction_type=transaction_type,
        amount_ht=amount_decimal,
        amount_vat=Decimal('0.00'),
        amount_ttc=amount_decimal,
        issued_date=date(2026, 6, 10),
    )


def _quote(
    budget_line: BudgetLine,
    *,
    amount: str,
    quote_status: QuoteStatus,
) -> Transaction:
    transaction = _transaction(
        budget_line,
        transaction_type=TransactionType.quote,
        amount=amount,
    )
    transaction.quote_status = quote_status
    return transaction


def _invoice(
    budget_line: BudgetLine,
    *,
    amount: str,
    invoice_type: InvoiceType,
    invoice_status: InvoiceStatus,
    payment_date: date | None = None,
    deleted_at: datetime | None = None,
) -> Transaction:
    transaction = _transaction(
        budget_line,
        transaction_type=TransactionType.invoice,
        amount=amount,
    )
    transaction.payment_date = payment_date
    transaction.invoice_status = invoice_status
    transaction.invoice_type = invoice_type
    transaction.deleted_at = deleted_at
    return transaction


def auth_headers(access_token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {access_token}'}


async def test_project_financial_summary_returns_dashboard_totals(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_financial_summary_context(db_session)

    response = await client.get(
        f'/projects/{context.project_id}/financial-summary',
        headers=auth_headers(context.access_token),
    )

    assert response.status_code == 200
    summary = cast(dict[str, object], response.json())
    assert summary['project_id'] == context.project_id
    assert summary['selected_budget_amount_ttc'] == '1450.00'
    assert summary['selected_quote_budget_amount_ttc'] == '1000.00'
    assert summary['selected_diy_budget_amount_ttc'] == '450.00'
    assert summary['quote_amount_ttc'] == '2200.00'
    assert summary['validated_quote_amount_ttc'] == '1000.00'
    assert summary['diy_estimate_amount_ttc'] == '450.00'
    assert summary['actual_cost_amount_ttc'] == '425.00'
    assert summary['paid_invoice_amount_ttc'] == '125.00'
    assert summary['unpaid_invoice_amount_ttc'] == '250.00'
    assert summary['on_hold_invoice_amount_ttc'] == '50.00'
    assert summary['selected_budget_variance_ttc'] == '1025.00'
    assert summary['selected_quote_budget_variance_ttc'] == '575.00'
    assert summary['quote_count'] == 2
    assert summary['validated_quote_count'] == 1
    assert summary['diy_estimate_count'] == 2
    assert summary['invoice_count'] == 4


async def test_project_financial_summary_breaks_down_by_product(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_financial_summary_context(db_session)

    response = await client.get(
        f'/projects/{context.project_id}/financial-summary',
        headers=auth_headers(context.access_token),
    )

    assert response.status_code == 200
    summary = cast(dict[str, object], response.json())
    products = cast(list[dict[str, object]], summary['products'])
    products_by_id = {product['product_id']: product for product in products}
    foundation = products_by_id[context.product_id]
    windows = products_by_id[context.second_product_id]

    assert foundation['product_name'] == 'Foundations'
    assert foundation['selected_budget_amount_ttc'] == '1150.00'
    assert foundation['selected_quote_budget_amount_ttc'] == '1000.00'
    assert foundation['selected_diy_budget_amount_ttc'] == '150.00'
    assert foundation['diy_estimate_amount_ttc'] == '150.00'
    assert foundation['actual_cost_amount_ttc'] == '400.00'
    assert foundation['invoice_count'] == 3
    assert len(cast(list[dict[str, object]], foundation['budget_lines'])) == 1

    assert windows['product_name'] == 'Windows'
    assert windows['selected_budget_amount_ttc'] == '300.00'
    assert windows['selected_diy_budget_amount_ttc'] == '300.00'
    assert windows['actual_cost_amount_ttc'] == '25.00'
    assert windows['invoice_count'] == 1


async def test_project_financial_summary_includes_empty_template_product(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    user = User(
        name='Empty Template Product User',
        email='empty-template-product-user@example.com',
        hashed_password='hashed-password',
    )
    category = Category(name='Empty Product Category')
    subcategory = Subcategory(category=category, name='Empty Product Subcategory')
    product = Product(subcategory=subcategory, name='Template-only product')
    template = Template(name='Empty Product Template')
    TemplateItem(
        template=template,
        product=product,
        default_name='Template-only budget',
        sort_order=10,
    )
    project = Project(user=user, template=template, name='Empty Product Project')

    db_session.add_all([user, category, subcategory, product, template, project])
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(project)
    await db_session.refresh(product)

    response = await client.get(
        f'/projects/{project.id}/financial-summary',
        headers=auth_headers(create_access_token(subject=str(user.id))),
    )

    assert response.status_code == 200
    summary = cast(dict[str, object], response.json())
    products = cast(list[dict[str, object]], summary['products'])
    assert len(products) == 1
    assert products[0]['product_id'] == product.id
    assert products[0]['product_name'] == 'Template-only product'
    assert products[0]['selected_budget_amount_ttc'] == '0.00'
    assert products[0]['actual_cost_amount_ttc'] == '0.00'
    assert products[0]['budget_lines'] == []
