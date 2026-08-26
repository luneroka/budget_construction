import jwt
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    SECRET_KEY,
    create_access_token,
    create_password_reset_token,
    hash_password,
)
from app.models.user import User
from app.repositories import user as user_repository
from tests.helpers import create_user, login_user


async def _me(client: AsyncClient, token: str):
    return await client.get('/users/me', headers={'Authorization': f'Bearer {token}'})


async def test_access_token_dies_when_the_password_changes(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    email = 'binding@example.com'
    await create_user(email=email)
    token = await login_user(client, email=email)
    assert (await _me(client, token)).status_code == 200

    claims = jwt.decode(token, options={'verify_signature': False})
    user = await db_session.get(User, int(claims['sub']))
    assert user is not None
    await user_repository.update_user_password(
        db_session, user, hashed_password=hash_password('Brand-New-Password1')
    )

    assert (await _me(client, token)).status_code == 401

    fresh_token = await login_user(client, email=email, password='Brand-New-Password1')
    assert (await _me(client, fresh_token)).status_code == 200


async def test_access_token_without_password_marker_is_rejected(
    client: AsyncClient,
) -> None:
    user = await create_user(email='no-marker@example.com')
    forged = jwt.encode(
        {'sub': str(user.id), 'exp': 4102444800, 'purpose': 'access'},
        SECRET_KEY,
        algorithm='HS256',
    )

    assert (await _me(client, forged)).status_code == 401


async def test_unsigned_token_is_rejected(client: AsyncClient) -> None:
    user = await create_user(email='alg-none@example.com')
    valid = create_access_token(subject=str(user.id), hashed_password=user.hashed_password)
    header, payload, _signature = valid.split('.')
    forged = f'{header}.{payload}.'

    assert (await _me(client, forged)).status_code == 401


async def test_reset_token_cannot_be_used_as_access_token(
    client: AsyncClient,
) -> None:
    user = await create_user(email='purpose@example.com')
    reset_token = create_password_reset_token(str(user.id), user.hashed_password)

    assert (await _me(client, reset_token)).status_code == 401
