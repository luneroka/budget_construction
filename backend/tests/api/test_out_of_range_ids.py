"""Ids beyond PostgreSQL's INTEGER range are valid Python ints, so they pass
Pydantic and only fail inside the asyncpg driver. Found by an OWASP ZAP API
scan (2026-09-15): every such request answered 500 instead of 422."""

from httpx import AsyncClient
from tests.helpers import create_authenticated_user

OUT_OF_RANGE_ID = 2**40


async def test_out_of_range_path_id_is_a_422(client: AsyncClient) -> None:
    access_token = await create_authenticated_user(
        client, email='out-of-range-path@example.com'
    )

    response = await client.get(
        f'/projects/{OUT_OF_RANGE_ID}',
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'invalid_input_value'


async def test_out_of_range_body_id_is_a_422(client: AsyncClient) -> None:
    access_token = await create_authenticated_user(
        client, email='out-of-range-body@example.com'
    )

    response = await client.post(
        '/projects/from-template',
        headers={'Authorization': f'Bearer {access_token}'},
        json={'template_id': OUT_OF_RANGE_ID, 'name': 'Overflow'},
    )

    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'invalid_input_value'


async def test_in_range_unknown_id_is_still_a_404(client: AsyncClient) -> None:
    access_token = await create_authenticated_user(
        client, email='in-range-unknown@example.com'
    )

    response = await client.get(
        '/projects/2147483647',
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert response.status_code == 404
