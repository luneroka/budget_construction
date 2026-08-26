from typing import Any, cast

from httpx import AsyncClient
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password
from app.models.user import User
from tests.helpers import create_authenticated_user, login_user


def _capture_reset_emails(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    sent: list[tuple[str, str]] = []

    async def fake_send_reset_password_email(to_email: str, reset_link: str) -> bool:
        sent.append((to_email, reset_link))
        return True

    monkeypatch.setattr(
        'app.routers.admin.mailer_service.send_reset_password_email',
        fake_send_reset_password_email,
    )
    return sent


async def test_admin_creates_user_and_invite_link_sets_password(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent = _capture_reset_emails(monkeypatch)
    admin_token = await create_authenticated_user(
        client, email='admin@example.com', is_admin=True
    )

    response = await client.post(
        '/admin/users/',
        headers={'Authorization': f'Bearer {admin_token}'},
        json={'name': 'Invited User', 'email': 'invited@example.com'},
    )

    assert response.status_code == 201
    payload = cast(dict[str, Any], response.json())
    assert payload['email'] == 'invited@example.com'
    assert payload['is_admin'] is False
    assert payload['is_active'] is True

    assert len(sent) == 1
    to_email, reset_link = sent[0]
    assert to_email == 'invited@example.com'
    token = reset_link.split('token=', 1)[1]

    reset_response = await client.post(
        '/auth/reset-password',
        json={'token': token, 'new_password': 'ChosenByUser123!'},
    )
    assert reset_response.status_code == 200

    await login_user(client, email='invited@example.com', password='ChosenByUser123!')

    user = await db_session.scalar(
        select(User).where(User.email == 'invited@example.com')
    )
    assert user is not None
    assert verify_password('ChosenByUser123!', user.hashed_password)


async def test_admin_create_user_rejects_duplicate_email(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent = _capture_reset_emails(monkeypatch)
    admin_token = await create_authenticated_user(
        client, email='admin-dup@example.com', is_admin=True
    )

    response = await client.post(
        '/admin/users/',
        headers={'Authorization': f'Bearer {admin_token}'},
        json={'name': 'Same Email', 'email': 'admin-dup@example.com'},
    )

    assert response.status_code == 409
    assert sent == []


async def test_non_admin_cannot_create_users(client: AsyncClient) -> None:
    user_token = await create_authenticated_user(client, email='member@example.com')

    response = await client.post(
        '/admin/users/',
        headers={'Authorization': f'Bearer {user_token}'},
        json={'name': 'Nope', 'email': 'nope@example.com'},
    )

    assert response.status_code == 403


async def test_anonymous_cannot_create_users(client: AsyncClient) -> None:
    response = await client.post(
        '/admin/users/',
        json={'name': 'Nope', 'email': 'nope@example.com'},
    )

    assert response.status_code == 401
