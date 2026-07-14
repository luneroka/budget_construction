from typing import cast

from httpx import AsyncClient
import pytest

PASSWORD = 'Password123!'
JsonValue = None | bool | int | float | str | list['JsonValue'] | dict[str, 'JsonValue']


async def create_authenticated_user(client: AsyncClient, *, email: str) -> str:
    register_response = await client.post(
        '/auth/register',
        json={
            'name': 'Supplier Route User',
            'email': email,
            'password': PASSWORD,
        },
    )
    assert register_response.status_code == 201

    login_response = await client.post(
        '/auth/login',
        data={
            'username': email,
            'password': PASSWORD,
        },
    )
    assert login_response.status_code == 200

    payload = cast(dict[str, object], login_response.json())
    access_token = payload.get('access_token')
    assert isinstance(access_token, str)
    return access_token


async def test_supplier_routes_expose_contacts_without_flat_contact_fields(
    client: AsyncClient,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='supplier-route-user@example.com',
    )
    create_payload: dict[str, JsonValue] = {
        'name': 'Supplier With Contacts',
        'siret': '12345678901234',
        'comment': 'Normalized supplier contacts',
        'contacts': [
            {
                'name': 'Primary Contact',
                'phone_number': '+33 1 00 00 00 01',
                'email': 'primary@example.com',
                'is_primary': True,
            },
            {
                'name': 'Secondary Contact',
                'phone_number': '+33 1 00 00 00 02',
                'email': 'secondary@example.com',
                'is_primary': False,
            },
        ],
    }

    create_response = await client.post(
        '/suppliers/',
        headers={'Authorization': f'Bearer {access_token}'},
        json=create_payload,
    )

    assert create_response.status_code == 201
    created_supplier = cast(dict[str, object], create_response.json())
    assert 'contacts' in created_supplier
    assert 'contact_name' not in created_supplier
    assert 'phone_number' not in created_supplier
    assert 'email' not in created_supplier

    contacts = cast(list[dict[str, object]], created_supplier['contacts'])
    assert len(contacts) == 2
    assert sum(1 for contact in contacts if contact['is_primary']) == 1
    assert contacts[0]['name'] == 'Primary Contact'

    supplier_id = created_supplier['id']
    assert isinstance(supplier_id, int)
    update_payload: dict[str, JsonValue] = {
        'contacts': [
            {
                'name': 'New Primary Contact',
                'phone_number': '+33 1 00 00 00 03',
                'email': 'new-primary@example.com',
                'is_primary': False,
            }
        ],
    }

    update_response = await client.patch(
        f'/suppliers/{supplier_id}',
        headers={'Authorization': f'Bearer {access_token}'},
        json=update_payload,
    )

    assert update_response.status_code == 200
    updated_supplier = cast(dict[str, object], update_response.json())
    updated_contacts = cast(list[dict[str, object]], updated_supplier['contacts'])
    assert len(updated_contacts) == 1
    assert updated_contacts[0]['name'] == 'New Primary Contact'
    assert updated_contacts[0]['is_primary'] is True


async def test_supplier_create_marks_single_contact_as_primary(
    client: AsyncClient,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='supplier-single-contact-user@example.com',
    )
    create_payload: dict[str, JsonValue] = {
        'name': 'Single Contact Supplier',
        'contacts': [
            {
                'name': 'Only Contact',
                'is_primary': False,
            }
        ],
    }

    response = await client.post(
        '/suppliers/',
        headers={'Authorization': f'Bearer {access_token}'},
        json=create_payload,
    )

    assert response.status_code == 201
    supplier = cast(dict[str, object], response.json())
    contacts = cast(list[dict[str, object]], supplier['contacts'])
    assert len(contacts) == 1
    assert contacts[0]['is_primary'] is True


async def test_supplier_create_rejects_multiple_primary_contacts(
    client: AsyncClient,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='supplier-route-validation-user@example.com',
    )
    invalid_payload: dict[str, JsonValue] = {
        'name': 'Invalid Supplier Contacts',
        'contacts': [
            {'name': 'First Primary', 'is_primary': True},
            {'name': 'Second Primary', 'is_primary': True},
        ],
    }

    response = await client.post(
        '/suppliers/',
        headers={'Authorization': f'Bearer {access_token}'},
        json=invalid_payload,
    )

    assert response.status_code == 422


async def test_supplier_address_round_trips_through_create_and_update(
    client: AsyncClient,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='supplier-address-user@example.com',
    )
    create_payload: dict[str, JsonValue] = {
        'name': 'Supplier With Address',
        'street': '12 Rue des Lilas',
        'complement': 'Bâtiment B',
        'postal_code': '75012',
        'city': 'Paris',
        'contacts': [{'name': 'Only Contact', 'is_primary': True}],
    }

    create_response = await client.post(
        '/suppliers/',
        headers={'Authorization': f'Bearer {access_token}'},
        json=create_payload,
    )

    assert create_response.status_code == 201
    created_supplier = cast(dict[str, object], create_response.json())
    assert created_supplier['street'] == '12 Rue des Lilas'
    assert created_supplier['complement'] == 'Bâtiment B'
    assert created_supplier['postal_code'] == '75012'
    assert created_supplier['city'] == 'Paris'

    supplier_id = created_supplier['id']
    assert isinstance(supplier_id, int)
    update_payload: dict[str, JsonValue] = {
        'street': '5 Avenue Foch',
        'complement': None,
        'postal_code': '69001',
        'city': 'Lyon',
    }

    update_response = await client.patch(
        f'/suppliers/{supplier_id}',
        headers={'Authorization': f'Bearer {access_token}'},
        json=update_payload,
    )

    assert update_response.status_code == 200
    updated_supplier = cast(dict[str, object], update_response.json())
    assert updated_supplier['street'] == '5 Avenue Foch'
    assert updated_supplier['complement'] is None
    assert updated_supplier['postal_code'] == '69001'
    assert updated_supplier['city'] == 'Lyon'


async def test_supplier_create_rejects_invalid_postal_code(
    client: AsyncClient,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='supplier-address-validation-user@example.com',
    )
    invalid_payload: dict[str, JsonValue] = {
        'name': 'Invalid Postal Code Supplier',
        'postal_code': 'invalid',
        'contacts': [{'name': 'Only Contact', 'is_primary': True}],
    }

    response = await client.post(
        '/suppliers/',
        headers={'Authorization': f'Bearer {access_token}'},
        json=invalid_payload,
    )

    assert response.status_code == 422


@pytest.mark.parametrize('method', ['GET', 'PATCH', 'DELETE'])
async def test_supplier_id_cannot_access_or_mutate_another_users_supplier(
    client: AsyncClient,
    method: str,
) -> None:
    owner_token = await create_authenticated_user(
        client,
        email=f'supplier-owner-{method}@example.com',
    )
    attacker_token = await create_authenticated_user(
        client,
        email=f'supplier-attacker-{method}@example.com',
    )
    create_payload: dict[str, JsonValue] = {
        'name': f'Private Supplier {method}',
        'contacts': [{'name': 'Private Contact', 'is_primary': True}],
    }
    create_response = await client.post(
        '/suppliers/',
        headers={'Authorization': f'Bearer {owner_token}'},
        json=create_payload,
    )
    assert create_response.status_code == 201
    supplier_id = create_response.json()['id']

    response = await client.request(
        method,
        f'/suppliers/{supplier_id}',
        headers={'Authorization': f'Bearer {attacker_token}'},
        json={'name': 'Attacker rename'} if method == 'PATCH' else None,
    )

    assert response.status_code == 404

    owner_response = await client.get(
        f'/suppliers/{supplier_id}',
        headers={'Authorization': f'Bearer {owner_token}'},
    )
    assert owner_response.status_code == 200
    assert owner_response.json()['name'] == f'Private Supplier {method}'
