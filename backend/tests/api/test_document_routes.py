from datetime import date
from decimal import Decimal
from typing import cast

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget_line import BudgetLine, BudgetLineType
from app.models.category import Category
from app.models.document import Document
from app.models.product import Product
from app.models.project import Project
from app.models.subcategory import Subcategory
from app.models.transaction import Transaction, TransactionType
from app.models.user import User

PASSWORD = 'Password123!'


async def create_authenticated_user(client: AsyncClient, *, email: str) -> str:
    register_response = await client.post(
        '/auth/register',
        json={
            'name': 'Document Route User',
            'email': email,
            'password': PASSWORD,
        },
    )
    assert register_response.status_code == 201

    login_response = await client.post(
        '/auth/login',
        data={
            'username': email,
            'password': PASSWORD,
        },
    )
    assert login_response.status_code == 200

    payload = cast(dict[str, object], login_response.json())
    access_token = payload.get('access_token')
    assert isinstance(access_token, str)
    return access_token


async def user_by_email(db_session: AsyncSession, email: str) -> User:
    result = await db_session.execute(select(User).where(User.email == email))
    user = result.scalar_one()
    return user


async def create_document_fixture(
    db_session: AsyncSession,
    user: User,
    *,
    transaction_type: TransactionType,
    description: str,
    filename: str,
) -> Document:
    category = Category(name=f'Category {filename}', sort_order=1)
    subcategory = Subcategory(
        category=category,
        name=f'Subcategory {filename}',
        sort_order=1,
    )
    product = Product(
        subcategory=subcategory,
        name=f'Product {filename}',
        sort_order=1,
    )
    project = Project(user=user, name=f'Project {filename}')
    budget_line = BudgetLine(
        project=project,
        product=product,
        name=f'Budget line {filename}',
        item_type=BudgetLineType.product,
    )
    transaction = Transaction(
        budget_line=budget_line,
        transaction_type=transaction_type,
        amount_ht=Decimal('100.00'),
        vat_rate=Decimal('20.00'),
        amount_vat=Decimal('20.00'),
        amount_ttc=Decimal('120.00'),
        issued_date=date(2026, 1, 1),
        description=description,
    )
    document = Document(
        transaction=transaction,
        user=user,
        original_filename=filename,
        stored_filename=f'stored-{filename}',
        file_path=f'documents/{filename}',
        mime_type='application/pdf',
        file_size=1234,
    )

    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)
    return document


async def test_document_list_returns_current_user_documents_with_transaction_metadata(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='document-route-user@example.com',
    )
    other_access_token = await create_authenticated_user(
        client,
        email='other-document-route-user@example.com',
    )
    user = await user_by_email(db_session, 'document-route-user@example.com')
    other_user = await user_by_email(
        db_session,
        'other-document-route-user@example.com',
    )
    document = await create_document_fixture(
        db_session,
        user,
        transaction_type=TransactionType.invoice,
        description='Facture - Terrassement',
        filename='invoice.pdf',
    )
    await create_document_fixture(
        db_session,
        other_user,
        transaction_type=TransactionType.quote,
        description='Devis - Electricite',
        filename='other.pdf',
    )

    response = await client.get(
        '/documents/',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    other_response = await client.get(
        '/documents/',
        headers={'Authorization': f'Bearer {other_access_token}'},
    )

    assert response.status_code == 200
    payload = cast(list[dict[str, object]], response.json())
    assert len(payload) == 1
    assert payload[0]['id'] == document.id
    assert payload[0]['original_filename'] == 'invoice.pdf'
    assert payload[0]['transaction_type'] == 'invoice'
    assert payload[0]['transaction_description'] == 'Facture - Terrassement'

    assert other_response.status_code == 200
    other_payload = cast(list[dict[str, object]], other_response.json())
    assert len(other_payload) == 1
    assert other_payload[0]['original_filename'] == 'other.pdf'
