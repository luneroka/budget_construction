from datetime import date
from decimal import Decimal
from typing import BinaryIO, cast

from httpx import AsyncClient
import pytest
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
    assert payload[0]['product_name'] == 'Product invoice.pdf'

    assert other_response.status_code == 200
    other_payload = cast(list[dict[str, object]], other_response.json())
    assert len(other_payload) == 1
    assert other_payload[0]['original_filename'] == 'other.pdf'


async def test_document_download_url_passes_requested_inline_option(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='document-download-route-user@example.com',
    )
    user = await user_by_email(
        db_session,
        'document-download-route-user@example.com',
    )
    document = await create_document_fixture(
        db_session,
        user,
        transaction_type=TransactionType.invoice,
        description='Facture - Menuiseries',
        filename='invoice-download.pdf',
    )
    calls: list[dict[str, object]] = []

    def fake_generate_download_url(
        object_key: str,
        filename: str | None = None,
        expires_in: int = 300,
        inline: bool = False,
    ) -> str:
        calls.append(
            {
                'object_key': object_key,
                'filename': filename,
                'expires_in': expires_in,
                'inline': inline,
            }
        )
        return f'https://documents.example/{object_key}?inline={inline}'

    monkeypatch.setattr(
        'app.routers.documents.generate_download_url',
        fake_generate_download_url,
    )

    inline_response = await client.get(
        f'/documents/{document.id}/download-url',
        params={'inline': True},
        headers={'Authorization': f'Bearer {access_token}'},
    )
    attachment_response = await client.get(
        f'/documents/{document.id}/download-url',
        params={'inline': False},
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert inline_response.status_code == 200
    assert inline_response.json()['url'].endswith('inline=True')
    assert attachment_response.status_code == 200
    assert attachment_response.json()['url'].endswith('inline=False')
    assert calls == [
        {
            'object_key': 'documents/invoice-download.pdf',
            'filename': 'invoice-download.pdf',
            'expires_in': 300,
            'inline': True,
        },
        {
            'object_key': 'documents/invoice-download.pdf',
            'filename': 'invoice-download.pdf',
            'expires_in': 300,
            'inline': False,
        },
    ]


@pytest.mark.parametrize(
    ('method', 'path_suffix'),
    [
        ('GET', ''),
        ('GET', '/download-url'),
        ('DELETE', ''),
        ('DELETE', '/permanent'),
    ],
)
async def test_document_id_cannot_access_or_delete_another_users_file(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
    path_suffix: str,
) -> None:
    owner_token = await create_authenticated_user(
        client,
        email=f'document-owner-{method}-{path_suffix.replace("/", "-")}@example.com',
    )
    attacker_token = await create_authenticated_user(
        client,
        email=f'document-attacker-{method}-{path_suffix.replace("/", "-")}@example.com',
    )
    owner = await user_by_email(
        db_session,
        f'document-owner-{method}-{path_suffix.replace("/", "-")}@example.com',
    )
    document = await create_document_fixture(
        db_session,
        owner,
        transaction_type=TransactionType.invoice,
        description='Private invoice',
        filename=f'private-{method}-{path_suffix.replace("/", "-")}.pdf',
    )
    storage_calls: list[str] = []

    def record_download(
        object_key: str,
        filename: str | None = None,
        expires_in: int = 300,
        inline: bool = False,
    ) -> str:
        del object_key, filename, expires_in, inline
        storage_calls.append('download')
        return 'unexpected'

    def record_delete(object_key: str) -> None:
        del object_key
        storage_calls.append('delete')

    monkeypatch.setattr(
        'app.routers.documents.generate_download_url',
        record_download,
    )
    monkeypatch.setattr(
        'app.routers.documents.delete_file_from_r2',
        record_delete,
    )

    response = await client.request(
        method,
        f'/documents/{document.id}{path_suffix}',
        headers={'Authorization': f'Bearer {attacker_token}'},
    )

    assert owner_token
    assert response.status_code == 404
    assert storage_calls == []
    persisted_document = await db_session.get(Document, document.id)
    assert persisted_document is not None
    assert persisted_document.deleted_at is None


async def test_document_upload_rejects_another_users_transaction_before_storage(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await create_authenticated_user(
        client,
        email='document-upload-owner@example.com',
    )
    attacker_token = await create_authenticated_user(
        client,
        email='document-upload-attacker@example.com',
    )
    owner = await user_by_email(db_session, 'document-upload-owner@example.com')
    document = await create_document_fixture(
        db_session,
        owner,
        transaction_type=TransactionType.invoice,
        description='Private upload target',
        filename='private-upload-target.pdf',
    )
    upload_calls: list[str] = []

    def record_upload(
        file: BinaryIO,
        object_key: str,
        content_type: str,
    ) -> str:
        del file, object_key, content_type
        upload_calls.append('upload')
        return 'unexpected'

    monkeypatch.setattr(
        'app.routers.documents.upload_file_to_r2',
        record_upload,
    )

    response = await client.post(
        f'/transactions/{document.transaction_id}/documents',
        headers={'Authorization': f'Bearer {attacker_token}'},
        files={'file': ('attack.pdf', b'%PDF-1.7\nforeign target', 'application/pdf')},
    )

    assert response.status_code == 404
    assert upload_calls == []
