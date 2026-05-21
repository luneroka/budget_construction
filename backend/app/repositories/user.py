from datetime import datetime, UTC
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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


async def soft_delete_user(db: AsyncSession, user_id: int) -> User | None:
    user = await get_user_by_id(db, user_id)

    if user is None:
        return None

    user.is_active = False
    user.deleted_at = datetime.now(UTC).replace(tzinfo=None)

    await db.commit()
    await db.refresh(user)

    return user
