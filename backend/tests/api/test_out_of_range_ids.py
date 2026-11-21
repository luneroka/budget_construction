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

    project = await client.post(
        '/projects/',
        headers={'Authorization': f'Bearer {access_token}'},
        json={'name': 'Overflow'},
    )

    response = await client.post(
        f'/projects/{project.json()["id"]}/transactions/',
        headers={'Authorization': f'Bearer {access_token}'},
        json={
            'lot_id': OUT_OF_RANGE_ID,
            'transaction_type': 'quote',
            'amount_ht': '10.00',
            'vat_rate': '20.00',
            'issued_date': '2026-01-01',
        },
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
