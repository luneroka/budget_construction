from typing import BinaryIO, cast

from httpx import AsyncClient
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.models.supplier_document import SupplierDocument
from app.models.user import User
from app.services.document_validation import MAX_FILE_SIZE

PASSWORD = 'Password123!'


async def create_authenticated_user(client: AsyncClient, *, email: str) -> str:
    register_response = await client.post(
        '/auth/register',
        json={
            'name': 'Supplier Document Route User',
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
    return result.scalar_one()


async def create_supplier_fixture(
    db_session: AsyncSession, user: User, *, name: str
) -> Supplier:
    supplier = Supplier(user=user, name=name)
    db_session.add(supplier)
    await db_session.commit()
    await db_session.refresh(supplier)
    return supplier


async def create_supplier_document_fixture(
    db_session: AsyncSession,
    user: User,
    supplier: Supplier,
    *,
    filename: str,
) -> SupplierDocument:
    document = SupplierDocument(
        supplier=supplier,
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


async def test_supplier_document_upload_and_list(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='supplier-document-upload-user@example.com',
    )
    user = await user_by_email(
        db_session, 'supplier-document-upload-user@example.com'
    )
    supplier = await create_supplier_fixture(db_session, user, name='RIB Supplier')

    def record_upload(
        file: BinaryIO,
        object_key: str,
        content_type: str,
    ) -> str:
        del file, content_type
        return object_key

    monkeypatch.setattr(
        'app.routers.supplier_documents.upload_file_to_r2',
        record_upload,
    )

    response = await client.post(
        f'/suppliers/{supplier.id}/documents',
        headers={'Authorization': f'Bearer {access_token}'},
        files={'file': ('rib.pdf', b'%PDF-1.7\nrib content', 'application/pdf')},
    )

    assert response.status_code == 201
    payload = cast(dict[str, object], response.json())
    assert payload['supplier_id'] == supplier.id
    assert payload['original_filename'] == 'rib.pdf'

    list_response = await client.get(
        f'/suppliers/{supplier.id}/documents',
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert list_response.status_code == 200
    documents = cast(list[dict[str, object]], list_response.json())
    assert len(documents) == 1
    assert documents[0]['original_filename'] == 'rib.pdf'


async def test_supplier_document_upload_rejects_another_users_supplier(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await create_authenticated_user(
        client,
        email='supplier-document-owner@example.com',
    )
    attacker_token = await create_authenticated_user(
        client,
        email='supplier-document-attacker@example.com',
    )
    owner = await user_by_email(db_session, 'supplier-document-owner@example.com')
    supplier = await create_supplier_fixture(db_session, owner, name='Private Supplier')

    response = await client.post(
        f'/suppliers/{supplier.id}/documents',
        headers={'Authorization': f'Bearer {attacker_token}'},
        files={'file': ('attack.pdf', b'%PDF-1.7\nforeign target', 'application/pdf')},
    )

    assert response.status_code == 404


async def test_supplier_document_upload_rejects_file_over_size_limit(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='supplier-document-oversize-user@example.com',
    )
    user = await user_by_email(
        db_session, 'supplier-document-oversize-user@example.com'
    )
    supplier = await create_supplier_fixture(db_session, user, name='Oversize Supplier')

    oversized_content = b'0' * (MAX_FILE_SIZE + 1)

    response = await client.post(
        f'/suppliers/{supplier.id}/documents',
        headers={'Authorization': f'Bearer {access_token}'},
        files={'file': ('too-big.pdf', oversized_content, 'application/pdf')},
    )

    assert response.status_code == 400
    assert response.json()['detail']['code'] == 'file_too_large'


async def test_supplier_document_download_url_passes_requested_inline_option(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='supplier-document-download-user@example.com',
    )
    user = await user_by_email(
        db_session, 'supplier-document-download-user@example.com'
    )
    supplier = await create_supplier_fixture(db_session, user, name='Download Supplier')
    document = await create_supplier_document_fixture(
        db_session, user, supplier, filename='rib-download.pdf'
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
        'app.routers.supplier_documents.generate_download_url',
        fake_generate_download_url,
    )

    response = await client.get(
        f'/supplier-documents/{document.id}/download-url',
        params={'inline': True},
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert response.status_code == 200
    assert response.json()['url'].endswith('inline=True')
    assert calls == [
        {
            'object_key': 'documents/rib-download.pdf',
            'filename': 'rib-download.pdf',
            'expires_in': 300,
            'inline': True,
        }
    ]


@pytest.mark.parametrize('method', ['GET', 'DELETE'])
async def test_supplier_document_id_cannot_access_or_delete_another_users_file(
    client: AsyncClient,
    db_session: AsyncSession,
    method: str,
) -> None:
    owner_token = await create_authenticated_user(
        client,
        email=f'supplier-document-owner-{method}@example.com',
    )
    attacker_token = await create_authenticated_user(
        client,
        email=f'supplier-document-attacker-{method}@example.com',
    )
    owner = await user_by_email(
        db_session, f'supplier-document-owner-{method}@example.com'
    )
    supplier = await create_supplier_fixture(
        db_session, owner, name=f'Private Supplier {method}'
    )
    document = await create_supplier_document_fixture(
        db_session, owner, supplier, filename=f'private-{method}.pdf'
    )

    path = (
        f'/supplier-documents/{document.id}/download-url'
        if method == 'GET'
        else f'/supplier-documents/{document.id}'
    )

    response = await client.request(
        method,
        path,
        headers={'Authorization': f'Bearer {attacker_token}'},
    )

    assert owner_token
    assert response.status_code == 404
    persisted_document = await db_session.get(SupplierDocument, document.id)
    assert persisted_document is not None
    assert persisted_document.deleted_at is None


async def test_supplier_document_soft_delete(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='supplier-document-delete-user@example.com',
    )
    user = await user_by_email(
        db_session, 'supplier-document-delete-user@example.com'
    )
    supplier = await create_supplier_fixture(db_session, user, name='Delete Supplier')
    document = await create_supplier_document_fixture(
        db_session, user, supplier, filename='to-delete.pdf'
    )

    response = await client.delete(
        f'/supplier-documents/{document.id}',
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert response.status_code == 204
    persisted_document = await db_session.get(SupplierDocument, document.id)
    assert persisted_document is not None
    assert persisted_document.deleted_at is not None

    list_response = await client.get(
        f'/suppliers/{supplier.id}/documents',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    assert list_response.status_code == 200
    assert list_response.json() == []


async def test_documents_list_includes_supplier_documents(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='supplier-document-list-user@example.com',
    )
    user = await user_by_email(db_session, 'supplier-document-list-user@example.com')
    supplier = await create_supplier_fixture(db_session, user, name='List Supplier')
    await create_supplier_document_fixture(
        db_session, user, supplier, filename='rib-list.pdf'
    )

    response = await client.get(
        '/documents/',
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert response.status_code == 200
    payload = cast(list[dict[str, object]], response.json())
    assert len(payload) == 1
    assert payload[0]['type'] == 'supplier_document'
    assert payload[0]['original_filename'] == 'rib-list.pdf'
    assert payload[0]['supplier_name'] == 'List Supplier'


async def test_supplier_soft_delete_cascades_to_documents_and_restore_reverts(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='supplier-document-cascade-user@example.com',
    )
    user = await user_by_email(
        db_session, 'supplier-document-cascade-user@example.com'
    )
    supplier = await create_supplier_fixture(db_session, user, name='Cascade Supplier')
    document = await create_supplier_document_fixture(
        db_session, user, supplier, filename='rib-cascade.pdf'
    )
    project_response = await client.post(
        '/projects/',
        headers={'Authorization': f'Bearer {access_token}'},
        json={'name': 'Cascade Project'},
    )
    assert project_response.status_code == 201
    project_id = project_response.json()['id']

    delete_response = await client.delete(
        f'/suppliers/{supplier.id}',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    assert delete_response.status_code == 200

    await db_session.refresh(document)
    assert document.deleted_at is not None

    trash_response = await client.get(
        f'/projects/{project_id}/trash/',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    assert trash_response.status_code == 200
    trash_items = cast(list[dict[str, object]], trash_response.json())
    document_items = [
        item for item in trash_items if item['type'] == 'supplier_document'
    ]
    assert len(document_items) == 1
    assert document_items[0]['can_restore'] is False
    assert document_items[0]['restore_blocked_reason'] == (
        'Restore the parent supplier first'
    )

    blocked_restore = await client.post(
        f'/projects/{project_id}/trash/supplier-documents/{document.id}/restore',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    assert blocked_restore.status_code == 400
    assert blocked_restore.json()['detail']['code'] == (
        'document_parent_supplier_restore_required'
    )

    restore_response = await client.post(
        f'/projects/{project_id}/trash/suppliers/{supplier.id}/restore',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    assert restore_response.status_code == 200

    await db_session.refresh(document)
    assert document.deleted_at is None


async def test_trash_supplier_document_restore_and_hard_delete(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='supplier-document-trash-user@example.com',
    )
    user = await user_by_email(db_session, 'supplier-document-trash-user@example.com')
    supplier = await create_supplier_fixture(db_session, user, name='Trash Supplier')
    document = await create_supplier_document_fixture(
        db_session, user, supplier, filename='rib-trash.pdf'
    )
    project_response = await client.post(
        '/projects/',
        headers={'Authorization': f'Bearer {access_token}'},
        json={'name': 'Trash Project'},
    )
    assert project_response.status_code == 201
    project_id = project_response.json()['id']

    soft_delete_response = await client.delete(
        f'/supplier-documents/{document.id}',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    assert soft_delete_response.status_code == 204

    trash_response = await client.get(
        f'/projects/{project_id}/trash/',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    trash_items = cast(list[dict[str, object]], trash_response.json())
    document_items = [
        item for item in trash_items if item['type'] == 'supplier_document'
    ]
    assert len(document_items) == 1
    assert document_items[0]['can_restore'] is True
    assert document_items[0]['supplier_name'] == 'Trash Supplier'

    restore_response = await client.post(
        f'/projects/{project_id}/trash/supplier-documents/{document.id}/restore',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    assert restore_response.status_code == 200
    await db_session.refresh(document)
    assert document.deleted_at is None

    soft_delete_again = await client.delete(
        f'/supplier-documents/{document.id}',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    assert soft_delete_again.status_code == 204

    deleted_files: list[str] = []

    def record_delete(object_key: str) -> None:
        deleted_files.append(object_key)

    monkeypatch.setattr('app.routers.trash.delete_file_from_r2', record_delete)

    hard_delete_response = await client.delete(
        f'/projects/{project_id}/trash/supplier-documents/{document.id}',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    assert hard_delete_response.status_code == 204
    assert deleted_files == ['documents/rib-trash.pdf']
    assert await db_session.get(SupplierDocument, document.id) is None


async def test_hard_delete_supplier_removes_document_files(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='supplier-document-hard-delete-user@example.com',
    )
    user = await user_by_email(
        db_session, 'supplier-document-hard-delete-user@example.com'
    )
    supplier = await create_supplier_fixture(
        db_session, user, name='Hard Delete Supplier'
    )
    document = await create_supplier_document_fixture(
        db_session, user, supplier, filename='rib-hard-delete.pdf'
    )
    project_response = await client.post(
        '/projects/',
        headers={'Authorization': f'Bearer {access_token}'},
        json={'name': 'Hard Delete Project'},
    )
    assert project_response.status_code == 201
    project_id = project_response.json()['id']

    soft_delete_response = await client.delete(
        f'/suppliers/{supplier.id}',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    assert soft_delete_response.status_code == 200

    deleted_files: list[str] = []

    def record_delete(object_key: str) -> None:
        deleted_files.append(object_key)

    monkeypatch.setattr('app.routers.trash.delete_file_from_r2', record_delete)

    hard_delete_response = await client.delete(
        f'/projects/{project_id}/trash/suppliers/{supplier.id}',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    assert hard_delete_response.status_code == 204
    assert deleted_files == ['documents/rib-hard-delete.pdf']
    assert await db_session.get(SupplierDocument, document.id) is None


async def test_supplier_document_upload_accepts_file_at_size_limit(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='supplier-document-at-limit-user@example.com',
    )
    user = await user_by_email(
        db_session, 'supplier-document-at-limit-user@example.com'
    )
    supplier = await create_supplier_fixture(db_session, user, name='At Limit Supplier')

    signature = b'%PDF-1.7\n'
    at_limit_content = signature + b'0' * (MAX_FILE_SIZE - len(signature))
    assert len(at_limit_content) == MAX_FILE_SIZE

    upload_calls: list[int] = []

    def record_upload(
        file: BinaryIO,
        object_key: str,
        content_type: str,
    ) -> str:
        del content_type
        file.seek(0, 2)
        upload_calls.append(file.tell())
        return object_key

    monkeypatch.setattr(
        'app.routers.supplier_documents.upload_file_to_r2',
        record_upload,
    )

    response = await client.post(
        f'/suppliers/{supplier.id}/documents',
        headers={'Authorization': f'Bearer {access_token}'},
        files={'file': ('at-limit.pdf', at_limit_content, 'application/pdf')},
    )

    assert response.status_code == 201
    assert upload_calls == [MAX_FILE_SIZE]
