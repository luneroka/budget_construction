from datetime import UTC, datetime, timedelta, date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget_line import BudgetLine, BudgetLineType
from app.models.category import Category
from app.models.document import Document
from app.models.product import Product
from app.models.project import Project
from app.models.subcategory import Subcategory
from app.models.supplier import Supplier
from app.models.transaction import QuoteStatus, Transaction, TransactionType
from app.models.user import User
from app.schemas.user import AdminUserUpdate
from app.services import user_lifecycle
from app.services.user_lifecycle import UserLifecycleError


async def create_user(
    db_session: AsyncSession,
    *,
    email: str = 'lifecycle-user@example.com',
    is_admin: bool = False,
    is_active: bool = True,
    deleted_at: datetime | None = None,
) -> User:
    user = User(
        name='Lifecycle User',
        email=email,
        hashed_password='hashed-password',
        is_admin=is_admin,
        is_active=is_active,
        deleted_at=deleted_at,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def create_user_owned_graph(
    db_session: AsyncSession,
) -> tuple[User, Project, BudgetLine, Transaction, Document, Supplier, Supplier]:
    user = await create_user(db_session)
    category = Category(name='Lifecycle Category')
    subcategory = Subcategory(category=category, name='Lifecycle Subcategory')
    product = Product(subcategory=subcategory, name='Lifecycle Product')
    project = Project(user=user, name='Lifecycle Project')
    supplier = Supplier(user=user, name='Lifecycle Supplier')
    previously_deleted_supplier = Supplier(
        user=user,
        name='Previously Deleted Supplier',
        deleted_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1),
    )
    budget_line = BudgetLine(
        project=project,
        product=product,
        name='Lifecycle Budget Line',
        item_type=BudgetLineType.product,
    )
    transaction = Transaction(
        budget_line=budget_line,
        transaction_type=TransactionType.quote,
        amount_ht=Decimal('100.00'),
        vat_rate=Decimal('20.00'),
        amount_vat=Decimal('20.00'),
        amount_ttc=Decimal('120.00'),
        issued_date=date(2026, 6, 16),
        quote_status=QuoteStatus.validated,
    )
    document = Document(
        transaction=transaction,
        user=user,
        original_filename='quote.pdf',
        stored_filename='stored-quote.pdf',
        file_path='documents/stored-quote.pdf',
        mime_type='application/pdf',
        file_size=1024,
    )

    db_session.add_all(
        [
            category,
            subcategory,
            product,
            project,
            supplier,
            previously_deleted_supplier,
            budget_line,
            transaction,
            document,
        ]
    )
    await db_session.commit()

    return (
        user,
        project,
        budget_line,
        transaction,
        document,
        supplier,
        previously_deleted_supplier,
    )


async def get_user(db_session: AsyncSession, user_id: int) -> User | None:
    result = await db_session.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def test_cannot_deactivate_last_active_admin(db_session: AsyncSession) -> None:
    admin = await create_user(
        db_session,
        email='admin@example.com',
        is_admin=True,
    )
    await db_session.commit()

    with pytest.raises(
        UserLifecycleError,
        match='Cannot deactivate the last admin user',
    ):
        await user_lifecycle.update_user(
            db_session,
            admin.id,
            AdminUserUpdate(is_active=False),
        )

    await db_session.refresh(admin)
    assert admin.is_active is True


async def test_cannot_delete_last_active_admin(db_session: AsyncSession) -> None:
    admin = await create_user(
        db_session,
        email='admin@example.com',
        is_admin=True,
    )
    await db_session.commit()

    with pytest.raises(
        UserLifecycleError,
        match='Cannot delete the last admin user',
    ):
        await user_lifecycle.soft_delete_user(db_session, admin.id)

    await db_session.refresh(admin)
    assert admin.deleted_at is None
    assert admin.is_active is True


async def test_soft_delete_user_cascades_to_owned_records(
    db_session: AsyncSession,
) -> None:
    (
        user,
        project,
        budget_line,
        transaction,
        document,
        supplier,
        previously_deleted_supplier,
    ) = await create_user_owned_graph(db_session)

    deleted_user = await user_lifecycle.soft_delete_user(db_session, user.id)

    assert deleted_user is not None
    assert deleted_user.is_active is False
    assert deleted_user.deleted_at is not None

    await db_session.refresh(project)
    await db_session.refresh(budget_line)
    await db_session.refresh(transaction)
    await db_session.refresh(document)
    await db_session.refresh(supplier)

    assert project.deleted_at == deleted_user.deleted_at
    assert budget_line.deleted_at == deleted_user.deleted_at
    assert transaction.deleted_at == deleted_user.deleted_at
    assert document.deleted_at == deleted_user.deleted_at
    assert supplier.deleted_at == deleted_user.deleted_at

    await db_session.refresh(previously_deleted_supplier)
    assert previously_deleted_supplier.deleted_at != deleted_user.deleted_at


async def test_restore_user_only_restores_records_from_same_delete_cascade(
    db_session: AsyncSession,
) -> None:
    (
        user,
        project,
        budget_line,
        transaction,
        document,
        supplier,
        previously_deleted_supplier,
    ) = await create_user_owned_graph(db_session)
    deleted_user = await user_lifecycle.soft_delete_user(db_session, user.id)
    assert deleted_user is not None
    cascade_deleted_at = deleted_user.deleted_at
    assert cascade_deleted_at is not None

    restored_user = await user_lifecycle.restore_user(db_session, user.id)

    assert restored_user is not None
    assert restored_user.is_active is True
    assert restored_user.deleted_at is None

    await db_session.refresh(project)
    await db_session.refresh(budget_line)
    await db_session.refresh(transaction)
    await db_session.refresh(document)
    await db_session.refresh(supplier)

    assert project.deleted_at is None
    assert budget_line.deleted_at is None
    assert transaction.deleted_at is None
    assert document.deleted_at is None
    assert supplier.deleted_at is None

    await db_session.refresh(previously_deleted_supplier)
    assert previously_deleted_supplier.deleted_at is not None
    assert previously_deleted_supplier.deleted_at != cascade_deleted_at


async def test_hard_delete_requires_soft_deleted_user(db_session: AsyncSession) -> None:
    user = await create_user(db_session)
    await db_session.commit()

    with pytest.raises(
        UserLifecycleError,
        match='User must be deleted before permanent deletion',
    ):
        await user_lifecycle.hard_delete_user(db_session, user.id)

    assert await get_user(db_session, user.id) is not None


async def test_hard_delete_removes_user_and_document_files(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user, _, _, _, document, _, _ = await create_user_owned_graph(db_session)
    file_path = document.file_path
    await user_lifecycle.soft_delete_user(db_session, user.id)

    deleted_file_paths: list[str] = []

    def delete_file_from_r2(file_path: str) -> None:
        deleted_file_paths.append(file_path)

    monkeypatch.setattr(user_lifecycle, 'delete_file_from_r2', delete_file_from_r2)

    deleted = await user_lifecycle.hard_delete_user(db_session, user.id)

    assert deleted is True
    assert await get_user(db_session, user.id) is None
    assert deleted_file_paths == [file_path]
