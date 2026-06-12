from datetime import UTC, datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.project import Project
from app.models.budget_line import BudgetLine
from app.models.supplier import Supplier
from app.models.transaction import Transaction
from app.models.user import User
from app.repositories import user as user_repository
from app.schemas.user import AdminUserUpdate
from app.services.storage import delete_file_from_r2


class UserLifecycleError(ValueError):
    pass


async def _get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))

    return result.scalar_one_or_none()


async def _ensure_user_can_be_deleted(db: AsyncSession, user: User) -> None:
    if not user.is_admin:
        return

    result = await db.execute(
        select(func.count())
        .select_from(User)
        .where(
            User.is_admin.is_(True),
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
    )
    if result.scalar_one() <= 1:
        raise UserLifecycleError('Cannot delete the last admin user')


async def _ensure_user_can_be_updated(
    db: AsyncSession, user: User, user_data: AdminUserUpdate
) -> None:
    if not user.is_admin or not user.is_active or user_data.is_active is not False:
        return

    result = await db.execute(
        select(func.count())
        .select_from(User)
        .where(
            User.is_admin.is_(True),
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
    )
    if result.scalar_one() <= 1:
        raise UserLifecycleError('Cannot deactivate the last admin user')


async def update_user(
    db: AsyncSession, user_id: int, user_data: AdminUserUpdate
) -> User | None:
    user = await user_repository.get_user_by_id(db, user_id)

    if user is None:
        return None

    await _ensure_user_can_be_updated(db, user, user_data)

    return await user_repository.update_user(
        db, user_id, user_data.model_dump(exclude_unset=True)
    )


async def soft_delete_user(db: AsyncSession, user_id: int) -> User | None:
    user = await user_repository.get_user_by_id(db, user_id)

    if user is None:
        return None

    await _ensure_user_can_be_deleted(db, user)

    deleted_at = datetime.now(UTC).replace(tzinfo=None)

    project_ids = select(Project.id).where(
        Project.user_id == user_id,
        Project.deleted_at.is_(None),
    )
    budget_line_ids = (
        select(BudgetLine.id)
        .join(Project, BudgetLine.project_id == Project.id)
        .where(
            Project.user_id == user_id,
            BudgetLine.deleted_at.is_(None),
        )
    )
    transaction_ids = (
        select(Transaction.id)
        .join(BudgetLine, Transaction.budget_line_id == BudgetLine.id)
        .join(Project, BudgetLine.project_id == Project.id)
        .where(
            Project.user_id == user_id,
            Transaction.deleted_at.is_(None),
        )
    )

    try:
        await db.execute(
            update(Document)
            .where(
                Document.user_id == user_id,
                Document.deleted_at.is_(None),
            )
            .values(deleted_at=deleted_at, updated_at=deleted_at)
        )
        await db.execute(
            update(Document)
            .where(
                Document.transaction_id.in_(transaction_ids),
                Document.deleted_at.is_(None),
            )
            .values(deleted_at=deleted_at, updated_at=deleted_at)
        )
        await db.execute(
            update(Transaction)
            .where(Transaction.id.in_(transaction_ids))
            .values(deleted_at=deleted_at, updated_at=deleted_at)
        )
        await db.execute(
            update(BudgetLine)
            .where(BudgetLine.id.in_(budget_line_ids))
            .values(deleted_at=deleted_at, updated_at=deleted_at)
        )
        await db.execute(
            update(Project)
            .where(Project.id.in_(project_ids))
            .values(deleted_at=deleted_at, updated_at=deleted_at)
        )
        await db.execute(
            update(Supplier)
            .where(
                Supplier.user_id == user_id,
                Supplier.deleted_at.is_(None),
            )
            .values(deleted_at=deleted_at, updated_at=deleted_at)
        )

        user.is_active = False
        user.deleted_at = deleted_at

        await db.commit()
        await db.refresh(user)
    except Exception:
        await db.rollback()
        raise

    return user


async def restore_user(db: AsyncSession, user_id: int) -> User | None:
    user = await _get_user_by_id(db, user_id)

    if user is None:
        return None

    if user.deleted_at is None:
        raise UserLifecycleError('User is not soft-deleted')

    deleted_at = user.deleted_at
    restored_at = datetime.now(UTC).replace(tzinfo=None)

    budget_line_ids = (
        select(BudgetLine.id)
        .join(Project, BudgetLine.project_id == Project.id)
        .where(
            Project.user_id == user_id,
            BudgetLine.deleted_at == deleted_at,
        )
    )
    transaction_ids = (
        select(Transaction.id)
        .join(BudgetLine, Transaction.budget_line_id == BudgetLine.id)
        .join(Project, BudgetLine.project_id == Project.id)
        .where(
            Project.user_id == user_id,
            Transaction.deleted_at == deleted_at,
        )
    )

    try:
        await db.execute(
            update(Document)
            .where(
                Document.user_id == user_id,
                Document.deleted_at == deleted_at,
            )
            .values(deleted_at=None, updated_at=restored_at)
        )
        await db.execute(
            update(Document)
            .where(
                Document.transaction_id.in_(transaction_ids),
                Document.deleted_at == deleted_at,
            )
            .values(deleted_at=None, updated_at=restored_at)
        )
        await db.execute(
            update(Transaction)
            .where(Transaction.id.in_(transaction_ids))
            .values(deleted_at=None, updated_at=restored_at)
        )
        await db.execute(
            update(BudgetLine)
            .where(BudgetLine.id.in_(budget_line_ids))
            .values(deleted_at=None, updated_at=restored_at)
        )
        await db.execute(
            update(Project)
            .where(
                Project.user_id == user_id,
                Project.deleted_at == deleted_at,
            )
            .values(deleted_at=None, updated_at=restored_at)
        )
        await db.execute(
            update(Supplier)
            .where(
                Supplier.user_id == user_id,
                Supplier.deleted_at == deleted_at,
            )
            .values(deleted_at=None, updated_at=restored_at)
        )

        user.is_active = True
        user.deleted_at = None
        user.updated_at = restored_at

        await db.commit()
        await db.refresh(user)
    except Exception:
        await db.rollback()
        raise

    return user


async def hard_delete_user(db: AsyncSession, user_id: int) -> bool:
    user = await _get_user_by_id(db, user_id)

    if user is None:
        return False

    if user.deleted_at is None:
        raise UserLifecycleError('User must be soft-deleted before hard deletion')

    try:
        result = await db.execute(
            select(Document.file_path).where(Document.user_id == user_id)
        )
        file_paths = list(result.scalars().all())

        for file_path in file_paths:
            delete_file_from_r2(file_path)

        await db.execute(delete(User).where(User.id == user_id))
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return True
