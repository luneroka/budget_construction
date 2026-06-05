from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def get_users(db: AsyncSession, include_deleted: bool = False) -> list[User]:
    query = select(User).order_by(User.name)

    if not include_deleted:
        query = query.where(User.deleted_at.is_(None))

    result = await db.execute(query)
    return list(result.scalars().all())


async def get_user_by_id_for_admin(
    db: AsyncSession, user_id: int, include_deleted: bool = False
) -> User | None:
    query = select(User).where(User.id == user_id)

    if not include_deleted:
        query = query.where(User.deleted_at.is_(None))

    result = await db.execute(query)

    return result.scalar_one_or_none()
