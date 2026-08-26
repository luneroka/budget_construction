from typing import Any, cast

from httpx import AsyncClient
import pytest

from tests.helpers import PASSWORD, create_authenticated_user


def _capture_notices(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    sent: list[tuple[str, str]] = []

    async def fake_notice(previous_email: str, new_email: str) -> bool:
        sent.append((previous_email, new_email))
        return True

    monkeypatch.setattr(
        'app.routers.users.mailer_service.send_email_changed_notice', fake_notice
    )
    return sent


async def test_name_change_does_not_require_password(client: AsyncClient) -> None:
    token = await create_authenticated_user(client, email='rename@example.com')

    response = await client.patch(
        '/users/me',
        headers={'Authorization': f'Bearer {token}'},
        json={'name': 'New Name'},
    )

    assert response.status_code == 200
    assert cast(dict[str, Any], response.json())['name'] == 'New Name'


async def test_email_change_requires_current_password(client: AsyncClient) -> None:
    token = await create_authenticated_user(client, email='before@example.com')

    response = await client.patch(
        '/users/me',
        headers={'Authorization': f'Bearer {token}'},
        json={'email': 'after@example.com'},
    )

    assert response.status_code == 400
    detail = cast(dict[str, Any], response.json())['detail']
    assert detail['code'] == 'current_password_required'


async def test_email_change_rejects_wrong_password(client: AsyncClient) -> None:
    token = await create_authenticated_user(client, email='before2@example.com')

    response = await client.patch(
        '/users/me',
        headers={'Authorization': f'Bearer {token}'},
        json={'email': 'after2@example.com', 'current_password': 'not-it'},
    )

    assert response.status_code == 403
    detail = cast(dict[str, Any], response.json())['detail']
    assert detail['code'] == 'current_password_invalid'

    me = await client.get('/users/me', headers={'Authorization': f'Bearer {token}'})
    assert cast(dict[str, Any], me.json())['email'] == 'before2@example.com'


async def test_email_change_with_password_revokes_sessions_and_notifies_old_address(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent = _capture_notices(monkeypatch)
    token = await create_authenticated_user(client, email='owner@example.com')

    response = await client.patch(
        '/users/me',
        headers={'Authorization': f'Bearer {token}'},
        json={'email': 'owner-new@example.com', 'current_password': PASSWORD},
    )

    assert response.status_code == 200
    assert cast(dict[str, Any], response.json())['email'] == 'owner-new@example.com'
    assert sent == [('owner@example.com', 'owner-new@example.com')]

    # The refresh cookie issued at login is no longer accepted.
    refresh = await client.post('/auth/refresh')
    assert refresh.status_code == 401


async def test_same_email_is_a_no_op_without_password(client: AsyncClient) -> None:
    token = await create_authenticated_user(client, email='same@example.com')

    response = await client.patch(
        '/users/me',
        headers={'Authorization': f'Bearer {token}'},
        json={'email': 'Same@example.com', 'name': 'Still Me'},
    )

    assert response.status_code == 200
