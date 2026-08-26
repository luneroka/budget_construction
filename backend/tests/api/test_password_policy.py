from typing import Any, cast

from httpx import AsyncClient
import pytest

from app.core.security import create_password_reset_token
from tests.helpers import create_user


@pytest.mark.parametrize(
    'bad_password',
    [
        'short1!',  # 7 chars
        'elevenchars',  # 11 chars
        'x' * 73,  # over the bcrypt limit
        ' padded-password-12',  # leading whitespace
    ],
)
async def test_reset_rejects_passwords_outside_policy(
    client: AsyncClient, bad_password: str
) -> None:
    user = await create_user(email='policy@example.com')
    token = create_password_reset_token(str(user.id), user.hashed_password)

    response = await client.post(
        '/auth/reset-password', json={'token': token, 'new_password': bad_password}
    )

    assert response.status_code == 422
    detail = cast(dict[str, Any], response.json())['detail']
    assert detail['code'] == 'request_validation_failed'
    assert detail['field'] == 'body.new_password'


async def test_reset_accepts_twelve_character_password(client: AsyncClient) -> None:
    user = await create_user(email='policy-ok@example.com')
    token = create_password_reset_token(str(user.id), user.hashed_password)

    response = await client.post(
        '/auth/reset-password', json={'token': token, 'new_password': 'exactly12chr'}
    )

    assert response.status_code == 200
