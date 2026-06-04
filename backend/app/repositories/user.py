from datetime import datetime, UTC
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.project import Project
from app.models.project_item import ProjectItem
from app.models.supplier import Supplier
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.user import UserCreate


async def create_user(
    db: AsyncSession, user_data: UserCreate, hashed_password: str
) -> User:
    user = User(
        name=user_data.name, email=user_data.email, hashed_password=hashed_password
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(
        select(User).where(User.email == email, User.deleted_at.is_(None))
    )

    return result.scalar_one_or_none()


async def update_user_password(
    db: AsyncSession,
    user: User,
    hashed_password: str,
) -> User:
    user.hashed_password = hashed_password

    await db.commit()
    await db.refresh(user)

    return user


async def soft_delete_user(db: AsyncSession, user_id: int) -> User | None:
    user = await get_user_by_id(db, user_id)

    if user is None:
        return None

    deleted_at = datetime.now(UTC).replace(tzinfo=None)

    project_ids = select(Project.id).where(
        Project.user_id == user_id,
        Project.deleted_at.is_(None),
    )
    project_item_ids = (
        select(ProjectItem.id)
        .join(Project, ProjectItem.project_id == Project.id)
        .where(
            Project.user_id == user_id,
            ProjectItem.deleted_at.is_(None),
        )
    )
    transaction_ids = (
        select(Transaction.id)
        .join(ProjectItem, Transaction.project_item_id == ProjectItem.id)
        .join(Project, ProjectItem.project_id == Project.id)
        .where(
            Project.user_id == user_id,
            Transaction.deleted_at.is_(None),
        )
    )

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
        update(ProjectItem)
        .where(ProjectItem.id.in_(project_item_ids))
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

    return user
