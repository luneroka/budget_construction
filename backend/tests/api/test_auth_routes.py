from typing import cast

from httpx import AsyncClient

from tests.helpers import create_user, login_user


async def test_public_registration_endpoint_does_not_exist(
    client: AsyncClient,
) -> None:
    response = await client.post(
        '/auth/register',
        json={
            'name': 'Stranger',
            'email': 'stranger@example.com',
            'password': 'Password123!',
        },
    )

    assert response.status_code == 404


async def test_login_returns_token(client: AsyncClient) -> None:
    email = 'login-route-user@example.com'
    await create_user(email=email)

    access_token = await login_user(client, email=email)

    assert access_token


async def test_users_me_works_with_token(client: AsyncClient) -> None:
    email = 'me-route-user@example.com'
    user = await create_user(email=email)
    access_token = await login_user(client, email=email)

    response = await client.get(
        '/users/me',
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert response.status_code == 200
    current_user = cast(dict[str, object], response.json())
    assert current_user['id'] == user.id
    assert current_user['email'] == email


async def test_protected_route_without_token_returns_401(
    client: AsyncClient,
) -> None:
    response = await client.get('/users/me')

    assert response.status_code == 401
