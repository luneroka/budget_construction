from httpx import AsyncClient

from app.routers.auth import REFRESH_COOKIE_PATH
from tests.helpers import PASSWORD, create_user


def _set_cookie_headers(response) -> list[str]:
    return [
        value
        for name, value in response.headers.multi_items()
        if name.lower() == 'set-cookie' and value.startswith('refresh_token=')
    ]


async def test_refresh_cookie_is_scoped_to_auth_routes_and_legacy_cookie_expired(
    client: AsyncClient,
) -> None:
    email = 'cookie-scope@example.com'
    await create_user(email=email)

    response = await client.post(
        '/auth/login', data={'username': email, 'password': PASSWORD}
    )
    assert response.status_code == 200

    cookies = _set_cookie_headers(response)
    live = [c for c in cookies if 'Max-Age=0' not in c and 'max-age=0' not in c]
    expired = [c for c in cookies if c not in live]

    assert len(live) == 1
    assert f'Path={REFRESH_COOKIE_PATH}' in live[0]
    assert 'HttpOnly' in live[0]
    assert 'samesite=lax' in live[0].lower()
    # The pre-2026-08 cookie on '/' is explicitly expired so it cannot shadow
    # the scoped one.
    assert any('Path=/;' in c or c.endswith('Path=/') for c in expired)

    # And the scoped cookie actually works for the routes that need it.
    refresh = await client.post('/auth/refresh')
    assert refresh.status_code == 200
