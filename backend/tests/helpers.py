"""Shared test helpers: users, projects, lots and transactions.

Accounts are created directly in the test database (there is no public
registration endpoint), using a dedicated session so callers keep their
`client`-only signatures. The database is reset around every test by the
`db_session` fixture in conftest.py, so users never leak between tests.
"""

import os
from dataclasses import dataclass
from typing import cast

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.security import hash_password
from app.models.lot import Lot
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


# --- Projects, lots and transactions -----------------------------------------


@dataclass(frozen=True)
class ProjectContext:
    """A user with one project, and a token to call the API as that user."""

    access_token: str
    user_id: int
    project_id: int

    @property
    def headers(self) -> dict[str, str]:
        return auth_headers(self.access_token)

    @property
    def transactions_url(self) -> str:
        return f'/projects/{self.project_id}/transactions/'


def auth_headers(access_token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {access_token}'}


async def create_project_context(
    client: AsyncClient,
    *,
    email: str,
    project_name: str = 'Maison test',
    is_admin: bool = False,
) -> ProjectContext:
    user = await create_user(email=email, is_admin=is_admin)
    access_token = await login_user(client, email=email)
    response = await client.post(
        '/projects/',
        headers=auth_headers(access_token),
        json={'name': project_name},
    )
    assert response.status_code == 201, response.text
    return ProjectContext(
        access_token=access_token,
        user_id=user.id,
        project_id=cast(int, response.json()['id']),
    )


async def global_lot_id(code: str) -> int:
    async with _SessionLocal() as session:
        result = await session.execute(
            select(Lot.id).where(Lot.project_id.is_(None), Lot.code == code)
        )
        return result.scalar_one()


def quote_payload(lot_id: int, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        'lot_id': lot_id,
        'transaction_type': 'quote',
        'amount_ht': '100.00',
        'vat_rate': '20.00',
        'issued_date': '2026-06-16',
        'quote_status': 'to_confirm',
    }
    payload.update(overrides)
    return payload


def invoice_payload(lot_id: int, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        'lot_id': lot_id,
        'transaction_type': 'invoice',
        'amount_ht': '100.00',
        'vat_rate': '20.00',
        'issued_date': '2026-06-20',
        'invoice_status': 'unpaid',
        'invoice_type': 'full',
    }
    payload.update(overrides)
    return payload


async def create_transaction(
    client: AsyncClient,
    context: ProjectContext,
    payload: dict[str, object],
) -> dict[str, object]:
    response = await client.post(
        context.transactions_url, headers=context.headers, json=payload
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, object], response.json())


async def create_supplier(
    client: AsyncClient, context: ProjectContext, name: str
) -> int:
    response = await client.post(
        '/suppliers/',
        headers=context.headers,
        json={'name': name, 'contacts': [{'name': f'Contact {name}'}]},
    )
    assert response.status_code == 201, response.text
    return cast(int, response.json()['id'])
