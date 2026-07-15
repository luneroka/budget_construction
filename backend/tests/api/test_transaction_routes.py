import csv
from dataclasses import dataclass
from datetime import datetime, UTC
from io import StringIO
from typing import cast

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.category import Category
from app.models.document import Document
from app.models.product import Product
from app.models.project import Project
from app.models.subcategory import Subcategory
from app.models.supplier import Supplier
from app.models.template import Template
from app.models.template_item import TemplateItem
from app.models.transaction import Transaction
from app.models.user import User
from app.services.export import CSV_COLUMNS


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


async def get_user_by_email(db_session: AsyncSession, email: str) -> User:
    result = await db_session.execute(select(User).where(User.email == email))
    return result.scalar_one()


def parse_csv_response(content: bytes) -> list[dict[str, str]]:
    text = content.decode('utf-8-sig')
    return list(csv.DictReader(StringIO(text)))


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
    assert selected_transaction['is_selected_budget'] is True


async def test_export_accounting_csv_downloads_human_readable_rows(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    email = 'accounting-csv-export-user@example.com'
    context = await create_transaction_route_context(db_session, email=email)
    user = await get_user_by_email(db_session, email)
    supplier = Supplier(
        user_id=user.id, name='Alpha Renovation', siret='12345678901234'
    )
    db_session.add(supplier)
    await db_session.commit()
    await db_session.refresh(supplier)

    invoice = await create_product_transaction(
        client,
        context,
        {
            **invoice_payload(),
            'supplier_id': supplier.id,
            'issued_date': '2026-06-20',
            'due_date': '2026-07-20',
            'payment_date': '2026-06-25',
            'invoice_status': 'paid',
            'invoice_type': 'deposit',
            'payment_method': 'wire',
            'description': 'Foundation invoice',
        },
    )
    document = Document(
        transaction_id=cast(int, invoice['id']),
        user_id=user.id,
        original_filename='foundation-invoice.pdf',
        stored_filename='stored-foundation-invoice.pdf',
        file_path='documents/stored-foundation-invoice.pdf',
        mime_type='application/pdf',
        file_size=128,
    )
    deleted_document = Document(
        transaction_id=cast(int, invoice['id']),
        user_id=user.id,
        original_filename='deleted-invoice.pdf',
        stored_filename='deleted-invoice.pdf',
        file_path='documents/deleted-invoice.pdf',
        mime_type='application/pdf',
        file_size=128,
        deleted_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db_session.add_all([document, deleted_document])
    await db_session.commit()

    response = await client.get(
        f'/projects/{context.project_id}/exports/accounting.csv',
        headers=auth_headers(context.access_token),
    )

    assert response.status_code == 200
    assert response.headers['content-type'].startswith('text/csv')
    assert (
        response.headers['content-disposition']
        == f'attachment; filename="project-{context.project_id}-accounting.csv"'
    )
    rows = parse_csv_response(response.content)
    assert len(rows) == 1
    assert list(rows[0].keys()) == CSV_COLUMNS
    assert rows[0]['Transaction ID'] == str(invoice['id'])
    assert rows[0]['Transaction type'] == 'Invoice'
    assert rows[0]['Supplier'] == 'Alpha Renovation'
    assert rows[0]['Supplier reference'] == '12345678901234'
    assert rows[0]['Project'] == f'Project {email}'
    assert rows[0]['Category'] == f'Category {email}'
    assert rows[0]['Subcategory'] == f'Subcategory {email}'
    assert rows[0]['Product'] == f'Product {email}'
    assert rows[0]['Budget line'] == 'Whole product budget'
    assert rows[0]['Amount HT'] == '120.00'
    assert rows[0]['VAT rate (%)'] == '20.00'
    assert rows[0]['VAT amount'] == '24.00'
    assert rows[0]['Amount TTC'] == '144.00'
    assert rows[0]['Issued date'] == '2026-06-20'
    assert rows[0]['Due date'] == '2026-07-20'
    assert rows[0]['Payment date'] == '2026-06-25'
    assert rows[0]['Invoice status'] == 'Paid'
    assert rows[0]['Invoice type'] == 'Deposit'
    assert rows[0]['Payment method'] == 'Wire transfer'
    assert rows[0]['Description'] == 'Foundation invoice'
    assert rows[0]['Document present'] == 'Yes'
    assert rows[0]['Document filename(s)'] == 'stored-foundation-invoice.pdf'
    assert rows[0]['Original document filename(s)'] == 'foundation-invoice.pdf'


async def test_export_accounting_csv_filters_by_date_and_transaction_type(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(
        db_session,
        email='accounting-csv-filter-user@example.com',
    )
    invoice = await create_product_transaction(
        client,
        context,
        {**invoice_payload(), 'issued_date': '2026-06-20'},
    )
    quote = await create_product_transaction(
        client,
        context,
        {**quote_payload(), 'issued_date': '2026-06-21'},
    )
    diy_estimate = await create_product_transaction(
        client,
        context,
        {**diy_estimate_payload(), 'issued_date': '2026-06-22'},
    )
    await create_product_transaction(
        client,
        context,
        {**invoice_payload(), 'issued_date': '2026-07-01'},
    )

    expected_by_filter = {
        'all': [invoice['id'], quote['id'], diy_estimate['id']],
        'invoices': [invoice['id']],
        'quotes': [quote['id']],
        'diy_estimates': [diy_estimate['id']],
    }
    for transaction_type, expected_ids in expected_by_filter.items():
        response = await client.get(
            f'/projects/{context.project_id}/exports/accounting.csv',
            headers=auth_headers(context.access_token),
            params={
                'start_date': '2026-06-01',
                'end_date': '2026-06-30',
                'transaction_type': transaction_type,
            },
        )

        assert response.status_code == 200
        rows = parse_csv_response(response.content)
        assert [row['Transaction ID'] for row in rows] == [
            str(transaction_id) for transaction_id in expected_ids
        ]


async def test_export_accounting_csv_excludes_deleted_transactions(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(
        db_session,
        email='accounting-csv-deleted-user@example.com',
    )
    active_invoice = await create_product_transaction(
        client,
        context,
        {**invoice_payload(), 'issued_date': '2026-06-20'},
    )
    deleted_invoice = await create_product_transaction(
        client,
        context,
        {**invoice_payload(), 'issued_date': '2026-06-21'},
    )
    result = await db_session.execute(
        select(Transaction).where(Transaction.id == deleted_invoice['id'])
    )
    transaction = result.scalar_one()
    transaction.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    await db_session.commit()

    response = await client.get(
        f'/projects/{context.project_id}/exports/accounting.csv',
        headers=auth_headers(context.access_token),
    )

    assert response.status_code == 200
    rows = parse_csv_response(response.content)
    assert [row['Transaction ID'] for row in rows] == [str(active_invoice['id'])]


async def test_export_accounting_csv_rejects_invalid_date_range(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(
        db_session,
        email='accounting-csv-invalid-date-user@example.com',
    )

    response = await client.get(
        f'/projects/{context.project_id}/exports/accounting.csv',
        headers=auth_headers(context.access_token),
        params={'start_date': '2026-07-01', 'end_date': '2026-06-01'},
    )

    assert response.status_code == 400


async def test_select_budget_candidate_allows_multiple_quotes_and_diy_estimates(
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
    second_quote = await create_product_transaction(
        client,
        context,
        {
            **quote_payload(quote_status='validated'),
            'amount_ht': '200.00',
        },
    )
    second_diy_estimate = await create_product_transaction(
        client,
        context,
        {
            **diy_estimate_payload(),
            'amount_ht': '75.00',
        },
    )

    budget_line_id = quote['budget_line_id']
    transaction_ids = [
        quote['id'],
        diy_estimate['id'],
        second_quote['id'],
        second_diy_estimate['id'],
    ]
    assert isinstance(budget_line_id, int)
    assert all(isinstance(transaction_id, int) for transaction_id in transaction_ids)

    for transaction_id in transaction_ids:
        response = await client.post(
            (
                f'/projects/{context.project_id}/budget-lines/{budget_line_id}'
                f'/transactions/{transaction_id}/select-budget'
            ),
            headers=auth_headers(context.access_token),
        )
        assert response.status_code == 200
        assert response.json()['is_selected_budget'] is True

    list_response = await client.get(
        f'/projects/{context.project_id}/budget-lines/{budget_line_id}/transactions/',
        headers=auth_headers(context.access_token),
    )
    assert list_response.status_code == 200
    selected_ids = {
        item['id'] for item in list_response.json() if item['is_selected_budget']
    }
    assert selected_ids == set(transaction_ids)


async def test_unselect_budget_candidate_clears_only_matching_selection(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(
        db_session,
        email='unselect-budget-candidate-user@example.com',
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

    budget_line_id = quote['budget_line_id']
    quote_id = quote['id']
    diy_estimate_id = diy_estimate['id']
    assert isinstance(budget_line_id, int)
    assert isinstance(quote_id, int)
    assert isinstance(diy_estimate_id, int)

    for transaction_id in [quote_id, diy_estimate_id]:
        response = await client.post(
            (
                f'/projects/{context.project_id}/budget-lines/{budget_line_id}'
                f'/transactions/{transaction_id}/select-budget'
            ),
            headers=auth_headers(context.access_token),
        )
        assert response.status_code == 200

    response = await client.delete(
        (
            f'/projects/{context.project_id}/budget-lines/{budget_line_id}'
            f'/transactions/{quote_id}/select-budget'
        ),
        headers=auth_headers(context.access_token),
    )

    assert response.status_code == 200
    assert response.json()['is_selected_budget'] is False

    list_response = await client.get(
        f'/projects/{context.project_id}/budget-lines/{budget_line_id}/transactions/',
        headers=auth_headers(context.access_token),
    )
    assert list_response.status_code == 200
    selected_ids = {
        item['id'] for item in list_response.json() if item['is_selected_budget']
    }
    assert selected_ids == {diy_estimate_id}


async def test_unselect_budget_candidate_allows_no_selected_budget(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(
        db_session,
        email='unselect-all-budget-candidates-user@example.com',
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

    budget_line_id = quote['budget_line_id']
    quote_id = quote['id']
    diy_estimate_id = diy_estimate['id']
    assert isinstance(budget_line_id, int)
    assert isinstance(quote_id, int)
    assert isinstance(diy_estimate_id, int)

    for transaction_id in [quote_id, diy_estimate_id]:
        response = await client.post(
            (
                f'/projects/{context.project_id}/budget-lines/{budget_line_id}'
                f'/transactions/{transaction_id}/select-budget'
            ),
            headers=auth_headers(context.access_token),
        )
        assert response.status_code == 200

    for transaction_id in [quote_id, diy_estimate_id]:
        response = await client.delete(
            (
                f'/projects/{context.project_id}/budget-lines/{budget_line_id}'
                f'/transactions/{transaction_id}/select-budget'
            ),
            headers=auth_headers(context.access_token),
        )
        assert response.status_code == 200
        assert response.json()['is_selected_budget'] is False


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


async def test_rejected_quote_cannot_be_selected_as_budget_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(
        db_session,
        email='rejected-quote-select-budget-candidate-user@example.com',
    )
    transaction = await create_product_transaction(
        client,
        context,
        quote_payload(quote_status='rejected'),
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

    list_response = await client.get(
        f'/projects/{context.project_id}/budget-lines/{budget_line_id}/transactions/',
        headers=auth_headers(context.access_token),
    )
    assert list_response.status_code == 200
    (transaction_state,) = [
        item for item in list_response.json() if item['id'] == transaction_id
    ]
    assert transaction_state['is_selected_budget'] is False


async def test_rejected_quote_remains_visible_in_budget_line_transactions(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(
        db_session,
        email='rejected-quote-visible-user@example.com',
    )
    transaction = await create_product_transaction(
        client,
        context,
        quote_payload(quote_status='rejected'),
    )
    budget_line_id = transaction['budget_line_id']
    assert isinstance(budget_line_id, int)

    response = await client.get(
        f'/projects/{context.project_id}/budget-lines/{budget_line_id}/transactions/',
        headers=auth_headers(context.access_token),
    )

    assert response.status_code == 200
    transactions = response.json()
    assert [item['id'] for item in transactions] == [transaction['id']]
    assert transactions[0]['quote_status'] == 'rejected'


async def test_rejected_quote_can_be_changed_back_and_selected(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(
        db_session,
        email='rejected-quote-lifecycle-user@example.com',
    )
    transaction = await create_product_transaction(
        client,
        context,
        quote_payload(quote_status='rejected'),
    )
    transaction_id = transaction['id']
    budget_line_id = transaction['budget_line_id']
    assert isinstance(transaction_id, int)
    assert isinstance(budget_line_id, int)

    update_response = await client.patch(
        (
            f'/projects/{context.project_id}/budget-lines/{budget_line_id}'
            f'/transactions/{transaction_id}'
        ),
        headers=auth_headers(context.access_token),
        json={'quote_status': 'validated'},
    )
    assert update_response.status_code == 200
    assert update_response.json()['quote_status'] == 'validated'

    select_response = await client.post(
        (
            f'/projects/{context.project_id}/budget-lines/{budget_line_id}'
            f'/transactions/{transaction_id}/select-budget'
        ),
        headers=auth_headers(context.access_token),
    )

    assert select_response.status_code == 200
    assert select_response.json()['is_selected_budget'] is True


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


async def test_invoice_cannot_be_unselected_as_budget_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_transaction_route_context(
        db_session,
        email='invoice-unselect-budget-candidate-user@example.com',
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

    response = await client.delete(
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
