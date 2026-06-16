from typing import cast

from httpx import AsyncClient


PASSWORD = 'Password123!'


async def register_user(
    client: AsyncClient,
    *,
    email: str = 'route-user@example.com',
) -> dict[str, object]:
    response = await client.post(
        '/auth/register',
        json={
            'name': 'Route User',
            'email': email,
            'password': PASSWORD,
        },
    )
    assert response.status_code == 201
    return cast(dict[str, object], response.json())


async def login_user(client: AsyncClient, *, email: str) -> str:
    response = await client.post(
        '/auth/login',
        data={
            'username': email,
            'password': PASSWORD,
        },
    )
    assert response.status_code == 200

    payload = cast(dict[str, object], response.json())
    access_token = payload.get('access_token')
    assert isinstance(access_token, str)
    return access_token


async def test_register_returns_201(client: AsyncClient) -> None:
    payload = await register_user(client)

    assert payload['email'] == 'route-user@example.com'


async def test_login_returns_token(client: AsyncClient) -> None:
    email = 'login-route-user@example.com'
    await register_user(client, email=email)

    access_token = await login_user(client, email=email)

    assert access_token


async def test_users_me_works_with_token(client: AsyncClient) -> None:
    email = 'me-route-user@example.com'
    registered_user = await register_user(client, email=email)
    access_token = await login_user(client, email=email)

    response = await client.get(
        '/users/me',
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert response.status_code == 200
    current_user = cast(dict[str, object], response.json())
    assert current_user['id'] == registered_user['id']
    assert current_user['email'] == email


async def test_protected_route_without_token_returns_401(
    client: AsyncClient,
) -> None:
    response = await client.get('/users/me')

    assert response.status_code == 401
