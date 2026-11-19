"""Global lots, project lots, visibility and supplier assignments (spec
criteria 1-6, 15 and 22)."""

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lot import Lot
from tests.helpers import (
    ProjectContext,
    create_project_context,
    create_supplier,
    create_transaction,
    global_lot_id,
    quote_payload,
)

APPENDIX_A = [
    ('00', 'Préparation de chantier'),
    ('01', 'Terrassement / VRD'),
    ('02', 'Gros œuvre / Maçonnerie'),
    ('03', 'Charpente'),
    ('04', 'Couverture / Zinguerie'),
    ('05', 'Étanchéité'),
    ('06', 'Menuiseries extérieures'),
    ('07', 'Fermetures / Occultations'),
    ('08', 'Ravalement façade'),
    ('09', 'Serrurerie / Métallerie'),
    ('10', 'Cloisons'),
    ('11', 'Menuiseries intérieures'),
    ('12', 'Électricité CFO/CFA'),
    ('13', 'Plomberie / Sanitaires'),
    ('14', 'Chauffage / Ventilation / ECS'),
    ('15', 'Carrelage / Faïence'),
    ('16', 'Sols souples / Parquets'),
    ('17', 'Peinture / Revêtements muraux'),
    ('18', 'Aménagements extérieurs'),
    ('19', 'Nettoyage de fin de chantier'),
    ('20', 'Cuisine équipée'),
    ('21', 'Photovoltaïque / Solaire thermique'),
    ('22', 'Piscine'),
    ('23', 'Domotique'),
    ('24', 'Cheminée / Poêle'),
]


def _lots_url(context: ProjectContext) -> str:
    return f'/projects/{context.project_id}/lots/'


def _supplier_lots_url(context: ProjectContext) -> str:
    return f'/projects/{context.project_id}/supplier-lots/'


async def _project_lots(client: AsyncClient, context: ProjectContext) -> list[dict]:
    response = await client.get(_lots_url(context), headers=context.headers)
    assert response.status_code == 200
    return response.json()


async def _set_hidden(
    client: AsyncClient, context: ProjectContext, lot_id: int, hidden: bool
):
    return await client.patch(
        f'/projects/{context.project_id}/lots/{lot_id}',
        headers=context.headers,
        json={'is_hidden': hidden},
    )


# --- Global lots -------------------------------------------------------------


async def test_new_project_sees_the_25_default_lots_and_adds_no_lot(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    count_before = (await db_session.execute(select(func.count(Lot.id)))).scalar_one()

    context = await create_project_context(client, email='defaults@example.com')

    count_after = (await db_session.execute(select(func.count(Lot.id)))).scalar_one()
    assert count_after == count_before == 25
    lots = await _project_lots(client, context)
    assert [(lot['code'], lot['designation']) for lot in lots] == APPENDIX_A
    assert all(lot['is_global'] and not lot['is_hidden'] for lot in lots)


async def test_only_admins_reach_the_global_lot_endpoints(client: AsyncClient) -> None:
    user = await create_project_context(client, email='not-admin@example.com')
    lot_id = await global_lot_id('05')

    for method, url, body in (
        ('GET', '/admin/lots/', None),
        ('PATCH', f'/admin/lots/{lot_id}', {'designation': 'Étanchéité toiture'}),
        ('POST', f'/admin/lots/{lot_id}/move', {'direction': 'up'}),
    ):
        response = await client.request(method, url, headers=user.headers, json=body)
        assert response.status_code == 403, url
        assert response.json()['detail']['code'] == 'admin_access_required'


async def test_admin_rename_is_seen_by_every_project(client: AsyncClient) -> None:
    admin = await create_project_context(
        client, email='admin-rename@example.com', is_admin=True
    )
    user = await create_project_context(client, email='user-rename@example.com')
    lot_id = await global_lot_id('05')

    response = await client.patch(
        f'/admin/lots/{lot_id}',
        headers=admin.headers,
        json={'code': ' 05b ', 'designation': '  Étanchéité toiture  '},
    )

    assert response.status_code == 200
    assert (response.json()['code'], response.json()['designation']) == (
        '05b',
        'Étanchéité toiture',
    )
    renamed = next(
        lot for lot in await _project_lots(client, user) if lot['id'] == lot_id
    )
    assert (renamed['code'], renamed['designation']) == ('05b', 'Étanchéité toiture')


async def test_global_code_and_designation_are_unique(client: AsyncClient) -> None:
    admin = await create_project_context(
        client, email='admin-unique@example.com', is_admin=True
    )
    lot_id = await global_lot_id('05')

    code = await client.patch(
        f'/admin/lots/{lot_id}', headers=admin.headers, json={'code': '06'}
    )
    designation = await client.patch(
        f'/admin/lots/{lot_id}', headers=admin.headers, json={'designation': 'Piscine'}
    )

    assert code.status_code == 409
    assert code.json()['detail']['code'] == 'lot_code_conflict'
    assert designation.status_code == 409
    assert designation.json()['detail']['code'] == 'lot_designation_conflict'


async def test_lot_code_and_designation_have_length_limits(
    client: AsyncClient,
) -> None:
    admin = await create_project_context(
        client, email='admin-limits@example.com', is_admin=True
    )
    lot_id = await global_lot_id('05')

    for body in (
        {'code': 'x' * 11},
        {'designation': 'x' * 121},
        {'code': '   '},
    ):
        response = await client.patch(
            f'/admin/lots/{lot_id}', headers=admin.headers, json=body
        )
        assert response.status_code == 422, body
    for body in (
        {'code': 'x' * 11, 'designation': 'Garage'},
        {'code': '91', 'designation': 'x' * 121},
    ):
        response = await client.post(_lots_url(admin), headers=admin.headers, json=body)
        assert response.status_code == 422, body

    ok = await client.patch(
        f'/admin/lots/{lot_id}',
        headers=admin.headers,
        json={'code': 'x' * 10, 'designation': 'y' * 120},
    )
    assert ok.status_code == 200


async def test_admin_reorders_global_lots(client: AsyncClient) -> None:
    admin = await create_project_context(
        client, email='admin-move@example.com', is_admin=True
    )
    first = await global_lot_id('00')
    last = await global_lot_id('24')

    down = await client.post(
        f'/admin/lots/{first}/move', headers=admin.headers, json={'direction': 'down'}
    )
    assert down.status_code == 200
    assert [lot['code'] for lot in down.json()[:3]] == ['01', '00', '02']

    # Moving the last lot down changes nothing.
    unchanged = await client.post(
        f'/admin/lots/{last}/move', headers=admin.headers, json={'direction': 'down'}
    )
    assert unchanged.json()[-1]['code'] == '24'

    project_order = [lot['code'] for lot in await _project_lots(client, admin)]
    assert project_order[:3] == ['01', '00', '02']


# Adding and deleting global lots: tests/api/test_global_lot_crud.py.


async def test_admin_recode_to_a_project_lot_code_keeps_both_lots(
    client: AsyncClient,
) -> None:
    admin = await create_project_context(
        client, email='admin-recode@example.com', is_admin=True
    )
    user = await create_project_context(client, email='user-recode@example.com')
    created = await client.post(
        _lots_url(user), headers=user.headers, json={'code': '90', 'designation': 'Abri'}
    )
    assert created.status_code == 201

    response = await client.patch(
        f'/admin/lots/{await global_lot_id("05")}',
        headers=admin.headers,
        json={'code': '90'},
    )

    assert response.status_code == 200
    codes = [lot['code'] for lot in await _project_lots(client, user)]
    assert codes.count('90') == 2


# --- Project lots and visibility ---------------------------------------------


async def test_project_lot_is_listed_after_global_lots_by_code(
    client: AsyncClient,
) -> None:
    context = await create_project_context(client, email='project-lot@example.com')

    for code, designation in (('92', 'Clôture'), ('91', '  Abri de jardin  ')):
        response = await client.post(
            _lots_url(context),
            headers=context.headers,
            json={'code': code, 'designation': designation},
        )
        assert response.status_code == 201
        assert response.json()['is_global'] is False
        assert response.json()['project_id'] == context.project_id

    lots = await _project_lots(client, context)
    assert [(lot['code'], lot['designation']) for lot in lots[-2:]] == [
        ('91', 'Abri de jardin'),
        ('92', 'Clôture'),
    ]


async def test_project_lot_code_must_be_new_in_the_project(
    client: AsyncClient,
) -> None:
    context = await create_project_context(client, email='project-code@example.com')
    other = await create_project_context(client, email='project-code-2@example.com')
    first = await client.post(
        _lots_url(context), headers=context.headers, json={'code': '90', 'designation': 'A'}
    )
    assert first.status_code == 201

    for code in ('02', '90'):
        response = await client.post(
            _lots_url(context),
            headers=context.headers,
            json={'code': code, 'designation': 'B'},
        )
        assert response.status_code == 409, code
        assert response.json()['detail']['code'] == 'lot_code_conflict'

    # Another project may reuse it.
    reused = await client.post(
        _lots_url(other), headers=other.headers, json={'code': '90', 'designation': 'A'}
    )
    assert reused.status_code == 201


async def test_lots_cannot_be_renamed_in_a_project(client: AsyncClient) -> None:
    context = await create_project_context(client, email='no-rename@example.com')

    response = await client.patch(
        f'/projects/{context.project_id}/lots/{await global_lot_id("05")}',
        headers=context.headers,
        json={'code': '99', 'designation': 'Renamed'},
    )

    assert response.status_code == 422


async def test_hide_and_unhide_a_global_lot_in_one_project(
    client: AsyncClient,
) -> None:
    context = await create_project_context(client, email='hide@example.com')
    other = await create_project_context(client, email='hide-other@example.com')
    lot_id = await global_lot_id('22')

    hidden = await _set_hidden(client, context, lot_id, True)

    assert hidden.status_code == 200
    assert hidden.json()['is_hidden'] is True
    summary = await client.get(
        f'/projects/{context.project_id}/financial-summary', headers=context.headers
    )
    assert lot_id not in [lot['lot_id'] for lot in summary.json()['lots']]
    # Visibility is per project.
    other_lot = next(
        lot for lot in await _project_lots(client, other) if lot['id'] == lot_id
    )
    assert other_lot['is_hidden'] is False

    shown = await _set_hidden(client, context, lot_id, False)
    assert shown.json()['is_hidden'] is False


async def test_hiding_in_another_users_project_is_a_404(client: AsyncClient) -> None:
    owner = await create_project_context(client, email='hide-owner@example.com')
    attacker = await create_project_context(client, email='hide-attacker@example.com')

    response = await client.patch(
        f'/projects/{owner.project_id}/lots/{await global_lot_id("22")}',
        headers=attacker.headers,
        json={'is_hidden': True},
    )

    assert response.status_code == 404


async def test_a_lot_with_active_transactions_cannot_be_hidden(
    client: AsyncClient,
) -> None:
    context = await create_project_context(client, email='hide-busy@example.com')
    lot_id = await global_lot_id('12')
    transaction = await create_transaction(client, context, quote_payload(lot_id))

    refused = await _set_hidden(client, context, lot_id, True)
    assert refused.status_code == 409
    assert refused.json()['detail']['code'] == 'lot_has_active_transactions'

    # Once its only transaction is soft-deleted, the lot may be hidden...
    await client.delete(
        f'{context.transactions_url}{transaction["id"]}', headers=context.headers
    )
    assert (await _set_hidden(client, context, lot_id, True)).status_code == 200

    # ...and restoring that transaction unhides it.
    restored = await client.post(
        f'/projects/{context.project_id}/trash/transactions/{transaction["id"]}/restore',
        headers=context.headers,
    )
    assert restored.status_code == 200
    lot = next(
        lot for lot in await _project_lots(client, context) if lot['id'] == lot_id
    )
    assert lot['is_hidden'] is False
    assert lot['active_transaction_count'] == 1


# --- Supplier <-> lot assignments --------------------------------------------


async def test_manual_assignment_for_a_supplier_without_transactions(
    client: AsyncClient,
) -> None:
    context = await create_project_context(client, email='assign-manual@example.com')
    supplier_id = await create_supplier(client, context, 'Électricien Petit')
    lot_id = await global_lot_id('12')

    created = await client.post(
        _supplier_lots_url(context),
        headers=context.headers,
        json={'supplier_id': supplier_id, 'lot_id': lot_id},
    )
    again = await client.post(
        _supplier_lots_url(context),
        headers=context.headers,
        json={'supplier_id': supplier_id, 'lot_id': lot_id},
    )

    assert created.status_code == 201
    assert again.status_code == 201
    listed = await client.get(_supplier_lots_url(context), headers=context.headers)
    assert listed.json() == [
        {'project_id': context.project_id, 'supplier_id': supplier_id, 'lot_id': lot_id}
    ]

    removed = await client.delete(
        f'{_supplier_lots_url(context)}{supplier_id}/{lot_id}', headers=context.headers
    )
    assert removed.status_code == 204
    assert (
        await client.get(_supplier_lots_url(context), headers=context.headers)
    ).json() == []


async def test_unassignment_is_refused_while_the_supplier_has_active_transactions(
    client: AsyncClient,
) -> None:
    context = await create_project_context(client, email='assign-busy@example.com')
    supplier_id = await create_supplier(client, context, 'Plombier Leroy')
    lot_id = await global_lot_id('13')
    transaction = await create_transaction(
        client, context, quote_payload(lot_id, supplier_id=supplier_id)
    )
    url = f'{_supplier_lots_url(context)}{supplier_id}/{lot_id}'

    refused = await client.delete(url, headers=context.headers)
    assert refused.status_code == 409
    assert refused.json()['detail']['code'] == 'supplier_lot_has_active_transactions'

    await client.delete(
        f'{context.transactions_url}{transaction["id"]}', headers=context.headers
    )
    assert (await client.delete(url, headers=context.headers)).status_code == 204


async def test_supplier_stays_assigned_when_its_last_transaction_leaves_the_lot(
    client: AsyncClient,
) -> None:
    context = await create_project_context(client, email='assign-stays@example.com')
    supplier_id = await create_supplier(client, context, 'Menuisier Blanc')
    first_lot = await global_lot_id('06')
    second_lot = await global_lot_id('11')
    transaction = await create_transaction(
        client, context, quote_payload(first_lot, supplier_id=supplier_id)
    )

    moved = await client.patch(
        f'{context.transactions_url}{transaction["id"]}',
        headers=context.headers,
        json={'lot_id': second_lot},
    )

    assert moved.status_code == 200
    listed = await client.get(_supplier_lots_url(context), headers=context.headers)
    assert sorted(row['lot_id'] for row in listed.json()) == sorted(
        [first_lot, second_lot]
    )


async def test_unknown_assignment_is_a_404(client: AsyncClient) -> None:
    context = await create_project_context(client, email='assign-404@example.com')
    supplier_id = await create_supplier(client, context, 'Couvreur Noir')

    response = await client.delete(
        f'{_supplier_lots_url(context)}{supplier_id}/{await global_lot_id("04")}',
        headers=context.headers,
    )

    assert response.status_code == 404
    assert response.json()['detail']['code'] == 'supplier_lot_not_found'
