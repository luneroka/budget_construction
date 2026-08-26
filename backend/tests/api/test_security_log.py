import logging

from httpx import AsyncClient
import pytest

from tests.helpers import PASSWORD, create_authenticated_user, create_user, login_user


def _events(caplog: pytest.LogCaptureFixture) -> list[str]:
    return [
        record.getMessage()
        for record in caplog.records
        if record.name == 'security'
    ]


async def test_login_outcomes_are_logged(
    client: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger='security')
    user = await create_user(email='logged@example.com')

    await client.post(
        '/auth/login', data={'username': 'logged@example.com', 'password': 'wrong'}
    )
    await login_user(client, email='logged@example.com', password=PASSWORD)

    events = _events(caplog)
    assert any(e.startswith('login_failed ip=') and 'email=logged@example.com' in e for e in events)
    assert f'login_success ip=127.0.0.1 user_id={user.id}' in events


async def test_admin_actions_name_actor_and_target(
    client: AsyncClient,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    caplog.set_level(logging.INFO, logger='security')

    async def fake_send(to_email: str, reset_link: str) -> bool:
        return True

    monkeypatch.setattr(
        'app.routers.admin.mailer_service.send_reset_password_email', fake_send
    )
    admin_token = await create_authenticated_user(
        client, email='admin-log@example.com', is_admin=True
    )

    created = await client.post(
        '/admin/users/',
        headers={'Authorization': f'Bearer {admin_token}'},
        json={'name': 'Target', 'email': 'target@example.com'},
    )
    target_id = created.json()['id']
    await client.patch(
        f'/admin/users/{target_id}',
        headers={'Authorization': f'Bearer {admin_token}'},
        json={'is_active': False},
    )

    events = _events(caplog)
    assert any(e.startswith('admin_user_created') and f'target={target_id}' in e for e in events)
    assert any(
        e.startswith('admin_user_updated') and 'fields=is_active' in e for e in events
    )


async def test_values_cannot_inject_new_log_lines(
    client: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger='security')

    await client.post(
        '/auth/login',
        data={'username': 'evil@example.com\nlogin_success user_id=1', 'password': 'x'},
    )

    events = _events(caplog)
    assert len(events) == 1
    assert '\n' not in events[0]
