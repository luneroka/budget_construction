from datetime import UTC, date, datetime
from decimal import Decimal
from typing import cast

from httpx import AsyncClient
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.budget_line import BudgetLine, BudgetLineType
from app.models.category import Category
from app.models.document import Document
from app.models.product import Product
from app.models.project import Project
from app.models.subcategory import Subcategory
from app.models.supplier import Supplier
from app.models.supplier_contact import SupplierContact
from app.models.transaction import Transaction, TransactionType
from app.models.user import User


def auth_headers(access_token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {access_token}'}


async def create_trash_context(
    db_session: AsyncSession,
    *,
    email: str = 'trash-route-user@example.com',
) -> tuple[str, int, int, int, int]:
    deleted_at = datetime.now(UTC).replace(tzinfo=None)
    user = User(
        name='Trash Route User',
        email=email,
        hashed_password='hashed-password',
    )
    category = Category(name=f'Category {email}', sort_order=1)
    subcategory = Subcategory(
        category=category,
        name=f'Subcategory {email}',
        sort_order=1,
    )
    product = Product(
        subcategory=subcategory,
        name=f'Product {email}',
        sort_order=1,
    )
    project = Project(user=user, name=f'Project {email}')
    budget_line = BudgetLine(
        project=project,
        product=product,
        name='Lot terrasse',
        item_type=BudgetLineType.product,
    )
    supplier = Supplier(
        user=user,
        name='Entreprise Dupont',
        deleted_at=deleted_at,
        updated_at=deleted_at,
    )
    supplier.contacts.append(SupplierContact(name='Contact Dupont', is_primary=True))
    transaction = Transaction(
        budget_line=budget_line,
        supplier=supplier,
        transaction_type=TransactionType.invoice,
        amount_ht=Decimal('100.00'),
        vat_rate=Decimal('20.00'),
        amount_vat=Decimal('20.00'),
        amount_ttc=Decimal('120.00'),
        issued_date=date(2026, 1, 1),
        description='Facture terrasse',
        deleted_at=deleted_at,
        updated_at=deleted_at,
    )
    document = Document(
        transaction=transaction,
        user=user,
        original_filename='facture.pdf',
        stored_filename='stored-facture.pdf',
        file_path='documents/facture.pdf',
        mime_type='application/pdf',
        file_size=1234,
        deleted_at=deleted_at,
        updated_at=deleted_at,
    )

    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(project)
    await db_session.refresh(transaction)
    await db_session.refresh(document)
    await db_session.refresh(supplier)

    return (
        create_access_token(subject=str(user.id)),
        project.id,
        transaction.id,
        document.id,
        supplier.id,
    )


async def test_project_trash_is_project_scoped(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token, project_id, transaction_id, document_id, supplier_id = (
        await create_trash_context(db_session)
    )
    other_access_token, other_project_id, *_ = await create_trash_context(
        db_session,
        email='other-trash-route-user@example.com',
    )

    response = await client.get(
        f'/projects/{project_id}/trash/',
        headers=auth_headers(access_token),
    )
    other_response = await client.get(
        f'/projects/{project_id}/trash/',
        headers=auth_headers(other_access_token),
    )
    other_project_response = await client.get(
        f'/projects/{other_project_id}/trash/',
        headers=auth_headers(access_token),
    )

    assert response.status_code == 200
    payload = cast(list[dict[str, object]], response.json())
    assert {(item['type'], item['id']) for item in payload} == {
        ('transaction', transaction_id),
        ('document', document_id),
        ('supplier', supplier_id),
    }
    document_item = next(item for item in payload if item['type'] == 'document')
    assert document_item['can_restore'] is False
    assert (
        document_item['restore_blocked_reason']
        == 'Restore the parent transaction first'
    )

    assert other_response.status_code == 404
    assert other_project_response.status_code == 404


async def test_project_trash_includes_deleted_supplier_without_transactions(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token, project_id, *_ = await create_trash_context(
        db_session,
        email='orphan-supplier-trash-user@example.com',
    )
    deleted_at = datetime.now(UTC).replace(tzinfo=None)
    user = await db_session.scalar(
        select(User).where(User.email == 'orphan-supplier-trash-user@example.com')
    )
    assert user is not None
    supplier = Supplier(
        user=user,
        name='Fournisseur sans transaction',
        deleted_at=deleted_at,
        updated_at=deleted_at,
    )
    db_session.add(supplier)
    await db_session.commit()
    await db_session.refresh(supplier)

    response = await client.get(
        f'/projects/{project_id}/trash/',
        headers=auth_headers(access_token),
    )

    assert response.status_code == 200
    payload = cast(list[dict[str, object]], response.json())
    supplier_item = next(
        item for item in payload if item['type'] == 'supplier' and item['id'] == supplier.id
    )
    assert supplier_item['linked_transaction_count'] == 0


async def test_restore_transaction_restores_attached_documents(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token, project_id, transaction_id, document_id, _ = (
        await create_trash_context(
            db_session,
            email='restore-transaction-trash-user@example.com',
        )
    )

    response = await client.post(
        f'/projects/{project_id}/trash/transactions/{transaction_id}/restore',
        headers=auth_headers(access_token),
    )

    assert response.status_code == 200
    restored_transaction = cast(dict[str, object], response.json())
    assert restored_transaction['deleted_at'] is None

    transaction = await db_session.get(Transaction, transaction_id)
    document = await db_session.get(Document, document_id)
    assert transaction is not None
    assert document is not None
    assert transaction.deleted_at is None
    assert document.deleted_at is None


async def test_restore_document_requires_active_parent_transaction(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token, project_id, _, document_id, _ = await create_trash_context(
        db_session,
        email='blocked-document-trash-user@example.com',
    )

    response = await client.post(
        f'/projects/{project_id}/trash/documents/{document_id}/restore',
        headers=auth_headers(access_token),
    )

    assert response.status_code == 400
    payload = cast(dict[str, object], response.json())
    detail = payload['detail']
    assert isinstance(detail, dict)
    assert detail['code'] == 'document_parent_transaction_restore_required'
    assert detail['message'] == 'Restore the parent transaction first'


async def test_restore_document_when_parent_transaction_is_active(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token, project_id, transaction_id, document_id, _ = (
        await create_trash_context(
            db_session,
            email='restore-document-trash-user@example.com',
        )
    )
    transaction = await db_session.get(Transaction, transaction_id)
    assert transaction is not None
    transaction.deleted_at = None
    await db_session.commit()

    response = await client.post(
        f'/projects/{project_id}/trash/documents/{document_id}/restore',
        headers=auth_headers(access_token),
    )

    assert response.status_code == 200
    restored_document = cast(dict[str, object], response.json())
    assert restored_document['deleted_at'] is None

    document = await db_session.get(Document, document_id)
    assert document is not None
    assert document.deleted_at is None


async def test_restore_supplier_only_restores_supplier(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token, project_id, transaction_id, _, supplier_id = (
        await create_trash_context(
            db_session,
            email='restore-supplier-trash-user@example.com',
        )
    )

    response = await client.post(
        f'/projects/{project_id}/trash/suppliers/{supplier_id}/restore',
        headers=auth_headers(access_token),
    )

    assert response.status_code == 200
    restored_supplier = cast(dict[str, object], response.json())
    assert restored_supplier['deleted_at'] is None

    supplier = await db_session.get(Supplier, supplier_id)
    transaction = await db_session.get(Transaction, transaction_id)
    assert supplier is not None
    assert transaction is not None
    assert supplier.deleted_at is None
    assert transaction.deleted_at is not None
    assert transaction.supplier_id == supplier_id


async def test_restore_transaction_is_not_available_from_another_project(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, project_id, transaction_id, _, _ = await create_trash_context(
        db_session,
        email='cross-project-trash-user@example.com',
    )
    other_access_token, _, *_ = await create_trash_context(
        db_session,
        email='cross-project-trash-other-user@example.com',
    )

    response = await client.post(
        f'/projects/{project_id}/trash/transactions/{transaction_id}/restore',
        headers=auth_headers(other_access_token),
    )

    assert response.status_code == 404

    result = await db_session.execute(
        select(Transaction.deleted_at).where(Transaction.id == transaction_id)
    )
    assert result.scalar_one() is not None


async def test_hard_delete_document_removes_metadata_and_file(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    access_token, project_id, _, document_id, _ = await create_trash_context(
        db_session,
        email='hard-delete-document-trash-user@example.com',
    )
    deleted_file_paths: list[str] = []

    monkeypatch.setattr(
        'app.routers.trash.delete_file_from_r2',
        lambda file_path: deleted_file_paths.append(file_path),
    )

    response = await client.delete(
        f'/projects/{project_id}/trash/documents/{document_id}',
        headers=auth_headers(access_token),
    )

    assert response.status_code == 204
    assert deleted_file_paths == ['documents/facture.pdf']
    assert await db_session.get(Document, document_id) is None


async def test_hard_delete_transaction_removes_transaction_documents_and_files(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    access_token, project_id, transaction_id, document_id, supplier_id = (
        await create_trash_context(
            db_session,
            email='hard-delete-transaction-trash-user@example.com',
        )
    )
    deleted_file_paths: list[str] = []

    monkeypatch.setattr(
        'app.routers.trash.delete_file_from_r2',
        lambda file_path: deleted_file_paths.append(file_path),
    )

    response = await client.delete(
        f'/projects/{project_id}/trash/transactions/{transaction_id}',
        headers=auth_headers(access_token),
    )

    assert response.status_code == 204
    assert deleted_file_paths == ['documents/facture.pdf']
    assert await db_session.get(Transaction, transaction_id) is None
    assert await db_session.get(Document, document_id) is None

    supplier = await db_session.get(Supplier, supplier_id)
    assert supplier is not None
    assert supplier.deleted_at is not None


async def test_hard_delete_supplier_removes_contacts_and_detaches_transactions(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    access_token, project_id, transaction_id, _, supplier_id = (
        await create_trash_context(
            db_session,
            email='hard-delete-supplier-trash-user@example.com',
        )
    )

    response = await client.delete(
        f'/projects/{project_id}/trash/suppliers/{supplier_id}',
        headers=auth_headers(access_token),
    )

    assert response.status_code == 204
    assert await db_session.get(Supplier, supplier_id) is None

    transaction = await db_session.get(Transaction, transaction_id)
    assert transaction is not None
    assert transaction.supplier_id is None

    contact_count = await db_session.scalar(
        select(func.count(SupplierContact.id)).where(
            SupplierContact.supplier_id == supplier_id
        )
    )
    assert contact_count == 0


async def test_empty_trash_permanently_deletes_all_project_trash(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    access_token, project_id, transaction_id, document_id, supplier_id = (
        await create_trash_context(
            db_session,
            email='empty-trash-route-user@example.com',
        )
    )
    deleted_file_paths: list[str] = []

    monkeypatch.setattr(
        'app.routers.trash.delete_file_from_r2',
        lambda file_path: deleted_file_paths.append(file_path),
    )

    response = await client.delete(
        f'/projects/{project_id}/trash/',
        headers=auth_headers(access_token),
    )

    assert response.status_code == 204
    assert deleted_file_paths == ['documents/facture.pdf']
    assert await db_session.get(Transaction, transaction_id) is None
    assert await db_session.get(Document, document_id) is None
    assert await db_session.get(Supplier, supplier_id) is None
