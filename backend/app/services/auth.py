from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.repositories import user as user_repository
from app.schemas.user import UserCreate
from app.models.user import User


async def register_user(db: AsyncSession, user_data: UserCreate) -> User | None:
    existing_user = await user_repository.get_user_by_email(db, user_data.email)

    if existing_user:
        return None

    hashed_password = hash_password(user_data.password)

    return await user_repository.create_user(
        db=db, user_data=user_data, hashed_password=hashed_password
    )


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    user = await user_repository.get_user_by_email(db, email)

    if user is None:
        return None

    if not user.is_active:
        return None

    if not verify_password(password, user.hashed_password):
        return None

    return user
