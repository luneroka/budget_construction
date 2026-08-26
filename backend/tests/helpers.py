"""Shared test helpers for creating and authenticating users.

Accounts are created directly in the test database (there is no public
registration endpoint), using a dedicated session so callers keep their
`client`-only signatures. The database is reset around every test by the
`db_session` fixture in conftest.py, so users never leak between tests.
"""

import os
from typing import cast

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.security import hash_password
from app.models.user import User

PASSWORD = 'Password123!'

_engine = create_async_engine(os.environ['DATABASE_URL'], poolclass=NullPool)
_SessionLocal = async_sessionmaker(bind=_engine, expire_on_commit=False)


async def create_user(
    *,
    email: str,
    name: str = 'Test User',
    password: str = PASSWORD,
    is_admin: bool = False,
    is_active: bool = True,
) -> User:
    async with _SessionLocal() as session:
        user = User(
            name=name,
            email=email,
            hashed_password=hash_password(password),
            is_admin=is_admin,
            is_active=is_active,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


async def login_user(
    client: AsyncClient, *, email: str, password: str = PASSWORD
) -> str:
    response = await client.post(
        '/auth/login',
        data={'username': email, 'password': password},
    )
    assert response.status_code == 200

    payload = cast(dict[str, object], response.json())
    access_token = payload.get('access_token')
    assert isinstance(access_token, str)
    return access_token


async def create_authenticated_user(
    client: AsyncClient,
    *,
    email: str,
    name: str = 'Test User',
    password: str = PASSWORD,
    is_admin: bool = False,
) -> str:
    await create_user(email=email, name=name, password=password, is_admin=is_admin)
    return await login_user(client, email=email, password=password)
