from typing import Any, cast

from httpx import AsyncClient
import pytest

from app.core.rate_limit import limiter, login_failures
from tests.helpers import PASSWORD, create_user


@pytest.fixture
def per_ip_limits_enabled():
    limiter.enabled = True
    limiter.reset()
    yield
    limiter.enabled = False
    limiter.reset()


async def _login(client: AsyncClient, *, email: str, password: str):
    return await client.post(
        '/auth/login', data={'username': email, 'password': password}
    )


async def test_login_is_rate_limited_per_ip(
    client: AsyncClient, per_ip_limits_enabled: None
) -> None:
    for _ in range(5):
        response = await _login(client, email='nobody@example.com', password='wrong')
        assert response.status_code == 401

    response = await _login(client, email='nobody@example.com', password='wrong')

    assert response.status_code == 429
    detail = cast(dict[str, Any], response.json())['detail']
    assert detail['code'] == 'rate_limited'
    assert 'retry-after' in response.headers


async def test_account_is_locked_after_repeated_failures(client: AsyncClient) -> None:
    email = 'locked@example.com'
    await create_user(email=email)

    for _ in range(login_failures.limit):
        response = await _login(client, email=email.upper(), password='wrong')
        assert response.status_code == 401

    # Even the right password is refused once the account is locked, and
    # the lock is keyed on the normalised address.
    response = await _login(client, email=email, password=PASSWORD)
    assert response.status_code == 429
    assert cast(dict[str, Any], response.json())['detail']['code'] == 'rate_limited'


async def test_successful_login_does_not_count_as_failure(client: AsyncClient) -> None:
    email = 'fine@example.com'
    await create_user(email=email)

    for _ in range(login_failures.limit):
        response = await _login(client, email=email, password=PASSWORD)
        assert response.status_code == 200


async def test_forgot_password_emails_are_capped_per_address(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    email = 'reset-me@example.com'
    await create_user(email=email)
    sent: list[str] = []

    async def fake_send_reset_password_email(to_email: str, reset_link: str) -> bool:
        sent.append(to_email)
        return True

    monkeypatch.setattr(
        'app.routers.auth.mailer_service.send_reset_password_email',
        fake_send_reset_password_email,
    )

    for _ in range(4):
        response = await client.post('/auth/forgot-password', json={'email': email})
        # The response is identical whether an email was sent or not.
        assert response.status_code == 200

    assert sent == [email, email, email]


async def test_contact_requests_are_rate_limited_per_ip(
    client: AsyncClient,
    per_ip_limits_enabled: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_send_contact_request_email(**kwargs: Any) -> bool:
        return True

    monkeypatch.setattr(
        'app.routers.contact_requests.mailer_service.send_contact_request_email',
        fake_send_contact_request_email,
    )
    payload = {
        'name': 'Jean',
        'email': 'jean@example.com',
        'reason': 'Essai',
        'message': 'Bonjour',
    }

    for _ in range(3):
        response = await client.post('/contact-requests', json=payload)
        assert response.status_code == 202

    response = await client.post('/contact-requests', json=payload)
    assert response.status_code == 429


async def test_limited_routes_still_respond_normally_when_under_the_limit(
    client: AsyncClient,
    per_ip_limits_enabled: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_send_reset_password_email(to_email: str, reset_link: str) -> bool:
        return True

    monkeypatch.setattr(
        'app.routers.auth.mailer_service.send_reset_password_email',
        fake_send_reset_password_email,
    )
    email = 'under-limit@example.com'
    await create_user(email=email)

    login = await _login(client, email=email, password=PASSWORD)
    assert login.status_code == 200
    assert 'x-ratelimit-remaining' in login.headers

    refresh = await client.post('/auth/refresh')
    assert refresh.status_code == 200

    forgot = await client.post('/auth/forgot-password', json={'email': email})
    assert forgot.status_code == 200

    reset = await client.post(
        '/auth/reset-password', json={'token': 'bogus', 'new_password': 'Password123!'}
    )
    assert reset.status_code == 400
