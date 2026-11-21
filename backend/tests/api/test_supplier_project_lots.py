"""The supplier form page saves the supplier and its « Lots du projet » in one
request (money-model spec criteria 13, 14 and 18): `project_lots` on
POST /suppliers/ and PATCH /suppliers/{id}, written in the same commit.
"""

from typing import Any

from httpx import AsyncClient

from tests.helpers import (
    ProjectContext,
    create_project_context,
    create_supplier,
    create_transaction,
    global_lot_id,
    quote_payload,
)


async def _assigned_lots(
    client: AsyncClient, context: ProjectContext, supplier_id: int
) -> set[int]:
    response = await client.get(
        f'/projects/{context.project_id}/supplier-lots/', headers=context.headers
    )
    assert response.status_code == 200, response.text
    return {
        row['lot_id'] for row in response.json() if row['supplier_id'] == supplier_id
    }


def _supplier_body(name: str, **extra: Any) -> dict[str, Any]:
    return {'name': name, 'contacts': [{'name': f'Contact {name}'}], **extra}


async def _patch(
    client: AsyncClient, context: ProjectContext, supplier_id: int, body: dict
) -> Any:
    return await client.patch(
        f'/suppliers/{supplier_id}', headers=context.headers, json=body
    )


async def test_creating_a_supplier_assigns_its_lots(client: AsyncClient) -> None:
    context = await create_project_context(client, email='form-create@example.com')
    lot_02, lot_06 = await global_lot_id('02'), await global_lot_id('06')

    response = await client.post(
        '/suppliers/',
        headers=context.headers,
        json=_supplier_body(
            'Maçon Durand',
            project_lots={
                'project_id': context.project_id,
                'lot_ids': [lot_02, lot_06, lot_02],
            },
        ),
    )

    assert response.status_code == 201, response.text
    assert 'project_lots' not in response.json()
    assert await _assigned_lots(client, context, response.json()['id']) == {
        lot_02,
        lot_06,
    }


async def test_editing_adds_and_removes_lots(client: AsyncClient) -> None:
    context = await create_project_context(client, email='form-edit@example.com')
    lot_02, lot_06, lot_10 = (
        await global_lot_id('02'),
        await global_lot_id('06'),
        await global_lot_id('10'),
    )
    supplier_id = await create_supplier(client, context, 'Menuisier Vert')
    first = await _patch(
        client,
        context,
        supplier_id,
        {'project_lots': {'project_id': context.project_id, 'lot_ids': [lot_02, lot_06]}},
    )
    assert first.status_code == 200, first.text

    response = await _patch(
        client,
        context,
        supplier_id,
        {
            'name': 'Menuiserie Vert',
            'project_lots': {
                'project_id': context.project_id,
                'lot_ids': [lot_06, lot_10],
            },
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()['name'] == 'Menuiserie Vert'
    assert await _assigned_lots(client, context, supplier_id) == {lot_06, lot_10}


async def test_an_edit_without_project_lots_leaves_the_lots_alone(
    client: AsyncClient,
) -> None:
    context = await create_project_context(client, email='form-nolots@example.com')
    lot_02 = await global_lot_id('02')
    supplier_id = await create_supplier(client, context, 'Plombier Petit')
    await _patch(
        client,
        context,
        supplier_id,
        {'project_lots': {'project_id': context.project_id, 'lot_ids': [lot_02]}},
    )

    response = await _patch(client, context, supplier_id, {'comment': 'Rapide'})

    assert response.status_code == 200, response.text
    assert await _assigned_lots(client, context, supplier_id) == {lot_02}


async def test_unticking_a_lot_with_active_transactions_is_refused(
    client: AsyncClient,
) -> None:
    context = await create_project_context(client, email='form-untick@example.com')
    lot_02, lot_06 = await global_lot_id('02'), await global_lot_id('06')
    supplier_id = await create_supplier(client, context, 'Couvreur Martin')
    # The quote assigns the supplier to lot 02.
    await create_transaction(
        client, context, quote_payload(lot_02, supplier_id=supplier_id)
    )

    response = await _patch(
        client,
        context,
        supplier_id,
        {
            'name': 'Renamed',
            'project_lots': {'project_id': context.project_id, 'lot_ids': [lot_06]},
        },
    )

    assert response.status_code == 409, response.text
    assert response.json()['detail']['code'] == 'supplier_lot_has_active_transactions'
    # Nothing of the request was saved: neither the name nor lot 06.
    supplier = await client.get(f'/suppliers/{supplier_id}', headers=context.headers)
    assert supplier.json()['name'] == 'Couvreur Martin'
    assert await _assigned_lots(client, context, supplier_id) == {lot_02}


async def test_saving_never_removes_a_hidden_lots_assignment(
    client: AsyncClient,
) -> None:
    context = await create_project_context(client, email='form-hidden@example.com')
    lot_02, lot_22 = await global_lot_id('02'), await global_lot_id('22')
    supplier_id = await create_supplier(client, context, 'Paysagiste Morel')
    await _patch(
        client,
        context,
        supplier_id,
        {'project_lots': {'project_id': context.project_id, 'lot_ids': [lot_22]}},
    )
    hidden = await client.patch(
        f'/projects/{context.project_id}/lots/{lot_22}',
        headers=context.headers,
        json={'is_hidden': True},
    )
    assert hidden.status_code == 200

    response = await _patch(
        client,
        context,
        supplier_id,
        {'project_lots': {'project_id': context.project_id, 'lot_ids': [lot_02]}},
    )
    assert response.status_code == 200, response.text

    unhidden = await client.patch(
        f'/projects/{context.project_id}/lots/{lot_22}',
        headers=context.headers,
        json={'is_hidden': False},
    )
    assert unhidden.status_code == 200
    assert await _assigned_lots(client, context, supplier_id) == {lot_02, lot_22}


async def test_a_hidden_lot_cannot_be_ticked(client: AsyncClient) -> None:
    context = await create_project_context(client, email='form-tick-hidden@example.com')
    lot_22 = await global_lot_id('22')
    hidden = await client.patch(
        f'/projects/{context.project_id}/lots/{lot_22}',
        headers=context.headers,
        json={'is_hidden': True},
    )
    assert hidden.status_code == 200

    response = await client.post(
        '/suppliers/',
        headers=context.headers,
        json=_supplier_body(
            'Carreleur Blanc',
            project_lots={'project_id': context.project_id, 'lot_ids': [lot_22]},
        ),
    )

    assert response.status_code == 400
    assert response.json()['detail']['code'] == 'lot_not_available'
    suppliers = await client.get('/suppliers/', headers=context.headers)
    assert suppliers.json() == []


async def test_another_users_project_is_not_found(client: AsyncClient) -> None:
    owner = await create_project_context(client, email='form-owner@example.com')
    intruder = await create_project_context(client, email='form-intruder@example.com')

    response = await client.post(
        '/suppliers/',
        headers=intruder.headers,
        json=_supplier_body(
            'Peintre Roux',
            project_lots={
                'project_id': owner.project_id,
                'lot_ids': [await global_lot_id('02')],
            },
        ),
    )

    assert response.status_code == 404
    assert response.json()['detail']['code'] == 'project_not_found'
    suppliers = await client.get('/suppliers/', headers=intruder.headers)
    assert suppliers.json() == []
