from datetime import datetime
from typing import cast

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.user import User
from app.services import auth as auth_service


PASSWORD = 'CorrectHorseBatteryStaple1!'


async def create_user(
    db_session: AsyncSession,
    *,
    email: str = 'auth-user@example.com',
    password: str = PASSWORD,
    is_active: bool = True,
    deleted_at: datetime | None = None,
) -> User:
    user = User(
        name='Auth User',
        email=email,
        hashed_password=hash_password(password),
        is_active=is_active,
        deleted_at=deleted_at,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def login(client: AsyncClient, *, email: str, password: str) -> str:
    response = await client.post(
        '/auth/login',
        data={'username': email, 'password': password},
    )
    assert response.status_code == 200

    payload = cast(dict[str, object], response.json())
    access_token = payload.get('access_token')
    assert isinstance(access_token, str)
    return access_token


async def test_active_user_can_authenticate(
    db_session: AsyncSession,
    client: AsyncClient,
) -> None:
    user = await create_user(db_session)

    access_token = await login(client, email=user.email, password=PASSWORD)

    assert access_token


async def test_inactive_user_cannot_authenticate(
    db_session: AsyncSession,
    client: AsyncClient,
) -> None:
    user = await create_user(db_session, is_active=False)

    response = await client.post(
        '/auth/login',
        data={'username': user.email, 'password': PASSWORD},
    )

    assert response.status_code == 401


async def test_wrong_password_rejected(
    db_session: AsyncSession,
    client: AsyncClient,
) -> None:
    user = await create_user(db_session)

    response = await client.post(
        '/auth/login',
        data={'username': user.email, 'password': 'wrong-password'},
    )

    assert response.status_code == 401


async def test_access_token_resolves_current_user(
    db_session: AsyncSession,
    client: AsyncClient,
) -> None:
    user = await create_user(db_session)
    access_token = await login(client, email=user.email, password=PASSWORD)

    response = await client.get(
        '/users/me',
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert response.status_code == 200
    payload = cast(dict[str, object], response.json())
    assert payload['id'] == user.id
    assert payload['email'] == user.email


@pytest.mark.parametrize(
    ('deleted_at', 'expected_status'),
    [
        (None, 403),
        (datetime(2026, 6, 16), 401),
    ],
)
async def test_access_token_fails_for_inactive_or_deleted_user(
    db_session: AsyncSession,
    client: AsyncClient,
    deleted_at: datetime | None,
    expected_status: int,
) -> None:
    user = await create_user(db_session)
    access_token = create_access_token(subject=str(user.id))

    user.is_active = False
    user.deleted_at = deleted_at
    await db_session.commit()

    response = await client.get(
        '/users/me',
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert response.status_code == expected_status


async def test_password_reset_token_cannot_be_used_as_access_token(
    db_session: AsyncSession,
    client: AsyncClient,
) -> None:
    user = await create_user(db_session)
    reset_token = await auth_service.generate_password_reset_token(
        db_session,
        user.email,
    )
    assert reset_token is not None

    response = await client.get(
        '/users/me',
        headers={'Authorization': f'Bearer {reset_token}'},
    )

    assert response.status_code == 401


async def test_access_token_cannot_be_used_as_password_reset_token(
    db_session: AsyncSession,
    client: AsyncClient,
) -> None:
    user = await create_user(db_session)
    access_token = create_access_token(subject=str(user.id))

    response = await client.post(
        '/auth/reset-password',
        json={'token': access_token, 'new_password': 'NewPassword123!'},
    )

    assert response.status_code == 400


@pytest.mark.parametrize(
    ('email', 'is_active'),
    [
        ('missing-user@example.com', True),
        ('inactive-user@example.com', False),
    ],
)
async def test_reset_token_for_missing_or_inactive_user_is_not_generated(
    db_session: AsyncSession,
    email: str,
    is_active: bool,
) -> None:
    if not is_active:
        await create_user(db_session, email=email, is_active=False)

    reset_token = await auth_service.generate_password_reset_token(db_session, email)

    assert reset_token is None


async def test_password_reset_token_cannot_be_replayed(
    db_session: AsyncSession,
) -> None:
    user = await create_user(
        db_session,
        email='single-use-reset-token@example.com',
    )
    reset_token = await auth_service.generate_password_reset_token(
        db_session,
        user.email,
    )
    assert reset_token is not None

    first_reset = await auth_service.reset_password(
        db_session,
        reset_token,
        'NewPassword123!',
    )
    replayed_reset = await auth_service.reset_password(
        db_session,
        reset_token,
        'AttackerChosenPassword123!',
    )

    assert first_reset is True
    assert replayed_reset is False
