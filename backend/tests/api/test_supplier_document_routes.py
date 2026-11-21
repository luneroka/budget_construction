from datetime import date, datetime
from typing import BinaryIO, cast

from httpx import AsyncClient
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.models.supplier_document import SupplierDocument, SupplierDocumentType
from app.models.user import User
from app.services.document_validation import MAX_FILE_SIZE
from tests.helpers import create_authenticated_user


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
    document_type: SupplierDocumentType = SupplierDocumentType.rib,
    expiry_date: date | None = None,
    created_at: datetime | None = None,
) -> SupplierDocument:
    document = SupplierDocument(
        supplier=supplier,
        user=user,
        type=document_type,
        expiry_date=expiry_date,
        original_filename=filename,
        stored_filename=f'stored-{filename}',
        file_path=f'documents/{filename}',
        mime_type='application/pdf',
        file_size=1234,
    )
    if created_at is not None:
        document.created_at = created_at

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
        'app.routers.uploads.upload_file_to_r2',
        record_upload,
    )

    response = await client.post(
        f'/suppliers/{supplier.id}/documents',
        headers={'Authorization': f'Bearer {access_token}'},
        files={'file': ('kbis.pdf', b'%PDF-1.7\nkbis content', 'application/pdf')},
        data={'type': 'kbis', 'expiry_date': '2027-03-31'},
    )

    assert response.status_code == 201
    payload = cast(dict[str, object], response.json())
    assert payload['supplier_id'] == supplier.id
    assert payload['original_filename'] == 'kbis.pdf'
    assert payload['type'] == 'kbis'
    assert payload['expiry_date'] == '2027-03-31'

    list_response = await client.get(
        f'/suppliers/{supplier.id}/documents',
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert list_response.status_code == 200
    documents = cast(list[dict[str, object]], list_response.json())
    assert len(documents) == 1
    assert documents[0]['original_filename'] == 'kbis.pdf'
    assert documents[0]['type'] == 'kbis'
    assert documents[0]['expiry_date'] == '2027-03-31'


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
        data={'type': 'rib'},
    )

    assert response.status_code == 404
    assert response.json()['detail']['code'] == 'supplier_not_found'


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
        data={'type': 'rib'},
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


@pytest.mark.parametrize('method', ['GET', 'PATCH', 'DELETE'])
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
        json={'type': 'kbis', 'expiry_date': '2030-01-01'}
        if method == 'PATCH'
        else None,
    )

    assert owner_token
    assert response.status_code == 404
    assert response.json()['detail']['code'] == 'document_not_found'
    await db_session.refresh(document)
    assert document.deleted_at is None
    assert document.type == SupplierDocumentType.rib
    assert document.expiry_date is None


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
        db_session,
        user,
        supplier,
        filename='rib-list.pdf',
        document_type=SupplierDocumentType.urssaf_certificate,
        expiry_date=date(2026, 12, 31),
    )

    response = await client.get(
        '/documents/',
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert response.status_code == 200
    payload = cast(list[dict[str, object]], response.json())
    assert len(payload) == 1
    assert payload[0]['type'] == 'supplier_document'
    assert payload[0]['document_type'] == 'urssaf_certificate'
    assert payload[0]['expiry_date'] == '2026-12-31'
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
        db_session,
        user,
        supplier,
        filename='rib-trash.pdf',
        document_type=SupplierDocumentType.decennial_insurance,
        expiry_date=date(2027, 6, 30),
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
    assert restore_response.json()['type'] == 'decennial_insurance'
    assert restore_response.json()['expiry_date'] == '2027-06-30'
    await db_session.refresh(document)
    assert document.deleted_at is None
    assert document.type == SupplierDocumentType.decennial_insurance
    assert document.expiry_date == date(2027, 6, 30)

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
        'app.routers.uploads.upload_file_to_r2',
        record_upload,
    )

    response = await client.post(
        f'/suppliers/{supplier.id}/documents',
        headers={'Authorization': f'Bearer {access_token}'},
        files={'file': ('at-limit.pdf', at_limit_content, 'application/pdf')},
        data={'type': 'other'},
    )

    assert response.status_code == 201
    assert upload_calls == [MAX_FILE_SIZE]


def refuse_upload(file: BinaryIO, object_key: str, content_type: str) -> str:
    del file, object_key, content_type
    raise AssertionError('a refused upload must not reach R2')


@pytest.mark.parametrize(
    ('label', 'data'),
    [
        ('missing', {}),
        ('unknown', {'type': 'passport'}),
        ('empty', {'type': ''}),
        ('bad-date', {'type': 'rib', 'expiry_date': 'soon'}),
    ],
)
async def test_supplier_document_upload_requires_a_known_type(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    label: str,
    data: dict[str, str],
) -> None:
    email = f'supplier-document-type-{label}@example.com'
    access_token = await create_authenticated_user(client, email=email)
    user = await user_by_email(db_session, email)
    supplier = await create_supplier_fixture(db_session, user, name='Typed Supplier')
    monkeypatch.setattr('app.routers.uploads.upload_file_to_r2', refuse_upload)

    response = await client.post(
        f'/suppliers/{supplier.id}/documents',
        headers={'Authorization': f'Bearer {access_token}'},
        files={'file': ('doc.pdf', b'%PDF-1.7\ncontent', 'application/pdf')},
        data=data,
    )

    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'request_validation_failed'
    remaining = await db_session.execute(
        select(SupplierDocument).where(SupplierDocument.supplier_id == supplier.id)
    )
    assert remaining.scalars().all() == []


async def test_supplier_document_upload_without_expiry_date(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    access_token = await create_authenticated_user(
        client, email='supplier-document-no-expiry@example.com'
    )
    user = await user_by_email(db_session, 'supplier-document-no-expiry@example.com')
    supplier = await create_supplier_fixture(db_session, user, name='No Expiry')

    def record_upload(file: BinaryIO, object_key: str, content_type: str) -> str:
        del file, content_type
        return object_key

    monkeypatch.setattr('app.routers.uploads.upload_file_to_r2', record_upload)

    response = await client.post(
        f'/suppliers/{supplier.id}/documents',
        headers={'Authorization': f'Bearer {access_token}'},
        files={'file': ('rib.pdf', b'%PDF-1.7\nrib', 'application/pdf')},
        data={'type': 'rib'},
    )

    assert response.status_code == 201
    assert response.json()['type'] == 'rib'
    assert response.json()['expiry_date'] is None


async def test_supplier_document_list_is_newest_first(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token = await create_authenticated_user(
        client, email='supplier-document-order@example.com'
    )
    user = await user_by_email(db_session, 'supplier-document-order@example.com')
    supplier = await create_supplier_fixture(db_session, user, name='Order Supplier')
    for filename, created_at in (
        ('middle.pdf', datetime(2026, 5, 1)),
        ('oldest.pdf', datetime(2026, 1, 1)),
        ('newest.pdf', datetime(2026, 9, 1)),
    ):
        await create_supplier_document_fixture(
            db_session, user, supplier, filename=filename, created_at=created_at
        )

    response = await client.get(
        f'/suppliers/{supplier.id}/documents',
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert response.status_code == 200
    assert [document['original_filename'] for document in response.json()] == [
        'newest.pdf',
        'middle.pdf',
        'oldest.pdf',
    ]


async def test_supplier_document_list_of_another_users_supplier_is_not_found(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await create_authenticated_user(client, email='supplier-list-owner@example.com')
    attacker_token = await create_authenticated_user(
        client, email='supplier-list-attacker@example.com'
    )
    owner = await user_by_email(db_session, 'supplier-list-owner@example.com')
    supplier = await create_supplier_fixture(db_session, owner, name='Owner Only')
    await create_supplier_document_fixture(
        db_session, owner, supplier, filename='owner.pdf'
    )

    response = await client.get(
        f'/suppliers/{supplier.id}/documents',
        headers={'Authorization': f'Bearer {attacker_token}'},
    )

    assert response.status_code == 404
    assert response.json()['detail']['code'] == 'supplier_not_found'


async def _patch_fixture(
    client: AsyncClient, db_session: AsyncSession, email: str
) -> tuple[str, SupplierDocument]:
    access_token = await create_authenticated_user(client, email=email)
    user = await user_by_email(db_session, email)
    supplier = await create_supplier_fixture(db_session, user, name='Patch Supplier')
    document = await create_supplier_document_fixture(
        db_session,
        user,
        supplier,
        filename='attestation.pdf',
        document_type=SupplierDocumentType.decennial_insurance,
        expiry_date=date(2026, 12, 31),
        created_at=datetime(2026, 1, 1),
    )
    document.updated_at = datetime(2026, 1, 1)
    await db_session.commit()
    await db_session.refresh(document)
    return access_token, document


def _file_columns(document: SupplierDocument) -> tuple[object, ...]:
    return (
        document.original_filename,
        document.stored_filename,
        document.file_path,
        document.mime_type,
        document.file_size,
        document.supplier_id,
        document.created_at,
    )


async def test_supplier_document_patch_changes_type_only(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token, document = await _patch_fixture(
        client, db_session, 'supplier-document-patch-type@example.com'
    )
    file_columns = _file_columns(document)

    response = await client.patch(
        f'/supplier-documents/{document.id}',
        headers={'Authorization': f'Bearer {access_token}'},
        json={'type': 'urssaf_certificate'},
    )

    assert response.status_code == 200
    assert response.json()['type'] == 'urssaf_certificate'
    assert response.json()['expiry_date'] == '2026-12-31'
    await db_session.refresh(document)
    assert document.type == SupplierDocumentType.urssaf_certificate
    assert document.expiry_date == date(2026, 12, 31)
    assert _file_columns(document) == file_columns
    assert document.updated_at > datetime(2026, 1, 1)


async def test_supplier_document_patch_changes_and_clears_the_expiry_date(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token, document = await _patch_fixture(
        client, db_session, 'supplier-document-patch-expiry@example.com'
    )
    file_columns = _file_columns(document)
    headers = {'Authorization': f'Bearer {access_token}'}

    changed = await client.patch(
        f'/supplier-documents/{document.id}',
        headers=headers,
        json={'expiry_date': '2028-02-29'},
    )

    assert changed.status_code == 200
    assert changed.json()['type'] == 'decennial_insurance'
    assert changed.json()['expiry_date'] == '2028-02-29'

    cleared = await client.patch(
        f'/supplier-documents/{document.id}',
        headers=headers,
        json={'expiry_date': None},
    )

    assert cleared.status_code == 200
    assert cleared.json()['expiry_date'] is None
    await db_session.refresh(document)
    assert document.type == SupplierDocumentType.decennial_insurance
    assert document.expiry_date is None
    assert _file_columns(document) == file_columns
    assert document.updated_at > datetime(2026, 1, 1)


async def test_supplier_document_patch_with_an_empty_body_only_touches_updated_at(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token, document = await _patch_fixture(
        client, db_session, 'supplier-document-patch-empty@example.com'
    )

    response = await client.patch(
        f'/supplier-documents/{document.id}',
        headers={'Authorization': f'Bearer {access_token}'},
        json={},
    )

    assert response.status_code == 200
    await db_session.refresh(document)
    assert document.type == SupplierDocumentType.decennial_insurance
    assert document.expiry_date == date(2026, 12, 31)
    assert document.updated_at > datetime(2026, 1, 1)


@pytest.mark.parametrize(
    ('label', 'body'),
    [
        ('null-type', {'type': None}),
        ('unknown-type', {'type': 'passport'}),
        ('bad-date', {'expiry_date': 'tomorrow'}),
    ],
)
async def test_supplier_document_patch_refuses_an_invalid_payload(
    client: AsyncClient,
    db_session: AsyncSession,
    label: str,
    body: dict[str, object],
) -> None:
    access_token, document = await _patch_fixture(
        client, db_session, f'supplier-document-patch-invalid-{label}@example.com'
    )

    response = await client.patch(
        f'/supplier-documents/{document.id}',
        headers={'Authorization': f'Bearer {access_token}'},
        json=body,
    )

    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'request_validation_failed'
    await db_session.refresh(document)
    assert document.type == SupplierDocumentType.decennial_insurance
    assert document.expiry_date == date(2026, 12, 31)
    assert document.updated_at == datetime(2026, 1, 1)


@pytest.mark.parametrize('method', ['GET', 'PATCH'])
async def test_soft_deleted_supplier_document_is_not_found(
    client: AsyncClient,
    db_session: AsyncSession,
    method: str,
) -> None:
    access_token, document = await _patch_fixture(
        client, db_session, f'supplier-document-binned-{method}@example.com'
    )
    headers = {'Authorization': f'Bearer {access_token}'}
    delete_response = await client.delete(
        f'/supplier-documents/{document.id}', headers=headers
    )
    assert delete_response.status_code == 204

    response = await client.request(
        method,
        f'/supplier-documents/{document.id}/download-url'
        if method == 'GET'
        else f'/supplier-documents/{document.id}',
        headers=headers,
        json={'type': 'kbis'} if method == 'PATCH' else None,
    )

    assert response.status_code == 404
    assert response.json()['detail']['code'] == 'document_not_found'
    await db_session.refresh(document)
    assert document.type == SupplierDocumentType.decennial_insurance


async def test_supplier_restore_restores_every_binned_document_with_its_type(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token = await create_authenticated_user(
        client, email='supplier-restore-all@example.com'
    )
    user = await user_by_email(db_session, 'supplier-restore-all@example.com')
    supplier = await create_supplier_fixture(db_session, user, name='Restore All')
    binned_alone = await create_supplier_document_fixture(
        db_session,
        user,
        supplier,
        filename='kbis.pdf',
        document_type=SupplierDocumentType.kbis,
        expiry_date=date(2026, 3, 1),
    )
    with_supplier = await create_supplier_document_fixture(
        db_session, user, supplier, filename='rib.pdf'
    )
    project_response = await client.post(
        '/projects/',
        headers={'Authorization': f'Bearer {access_token}'},
        json={'name': 'Restore All Project'},
    )
    project_id = project_response.json()['id']
    headers = {'Authorization': f'Bearer {access_token}'}

    assert (
        await client.delete(f'/supplier-documents/{binned_alone.id}', headers=headers)
    ).status_code == 204
    assert (await client.delete(f'/suppliers/{supplier.id}', headers=headers)).status_code == 200

    restore_response = await client.post(
        f'/projects/{project_id}/trash/suppliers/{supplier.id}/restore',
        headers=headers,
    )

    assert restore_response.status_code == 200
    listed = await client.get(f'/suppliers/{supplier.id}/documents', headers=headers)
    assert sorted(
        (document['original_filename'], document['type'], document['expiry_date'])
        for document in listed.json()
    ) == [('kbis.pdf', 'kbis', '2026-03-01'), ('rib.pdf', 'rib', None)]
    assert with_supplier.id in {document['id'] for document in listed.json()}
