from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

from app.core.security import (
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
    password_reset_token_matches_password,
    verify_password,
)
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


async def generate_password_reset_token(
    db: AsyncSession, email: str, expires_minutes: int = 15
) -> str | None:
    user = await user_repository.get_user_by_email(db, email)

    if user is None or not user.is_active:
        return None

    # Use user id as subject to avoid exposing email in token
    return create_password_reset_token(
        subject=str(user.id),
        hashed_password=user.hashed_password,
        expires_minutes=expires_minutes,
    )


async def reset_password(db: AsyncSession, token: str, new_password: str) -> bool:
    try:
        payload = decode_password_reset_token(token)
    except Exception:
        return False

    subject: Any = payload.get('sub')

    if not isinstance(subject, str):
        return False

    try:
        user_id = int(subject)
    except (TypeError, ValueError):
        return False

    user = await user_repository.get_user_by_id(db, user_id)

    if user is None or not user.is_active:
        return False

    if not password_reset_token_matches_password(payload, user.hashed_password):
        return False

    hashed = hash_password(new_password)

    await user_repository.update_user_password(db=db, user=user, hashed_password=hashed)

    return True
