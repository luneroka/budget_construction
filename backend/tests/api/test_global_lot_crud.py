"""Admin create and delete of global lots (spec
docs/specs/2026-11-19-global-lots-crud.md, criteria 1-13)."""

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.lot import Lot, ProjectHiddenLot, SupplierLot
from app.models.supplier import Supplier
from app.models.transaction import Transaction
from app.repositories import lot as lot_repository
from app.seed.default_lots import DEFAULT_LOTS
from tests.helpers import (
    ProjectContext,
    create_project_context,
    create_project_lot,
    create_supplier,
    create_transaction,
    global_lot_id,
    quote_payload,
)

ADMIN_LOTS_URL = '/admin/lots/'
DEFAULT_CODES = [code for code, _designation in DEFAULT_LOTS]


async def _admin(client: AsyncClient, email: str = 'admin@example.com'):
    return await create_project_context(client, email=email, is_admin=True)


async def _create(
    client: AsyncClient, admin: ProjectContext, code: str, designation: str
):
    return await client.post(
        ADMIN_LOTS_URL,
        headers=admin.headers,
        json={'code': code, 'designation': designation},
    )


async def _global_codes(client: AsyncClient, admin: ProjectContext) -> list[str]:
    response = await client.get(ADMIN_LOTS_URL, headers=admin.headers)
    assert response.status_code == 200
    return [lot['code'] for lot in response.json()]


async def _project_lots(client: AsyncClient, context: ProjectContext) -> list[dict]:
    response = await client.get(
        f'/projects/{context.project_id}/lots/', headers=context.headers
    )
    assert response.status_code == 200
    return response.json()


async def _move(
    client: AsyncClient, admin: ProjectContext, lot_id: int, direction: str
):
    response = await client.post(
        f'{ADMIN_LOTS_URL}{lot_id}/move',
        headers=admin.headers,
        json={'direction': direction},
    )
    assert response.status_code == 200
    return [lot['code'] for lot in response.json()]


async def _count(db_session: AsyncSession, model: type, *where: object) -> int:
    query = select(func.count()).select_from(model)
    if where:
        query = query.where(*where)
    return (await db_session.execute(query)).scalar_one()


# --- Create --------------------------------------------------------------------


async def test_admin_creates_a_trimmed_global_lot(client: AsyncClient) -> None:
    admin = await _admin(client)

    response = await _create(client, admin, '  25 ', '  Garage  ')

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {'id', 'code', 'designation', 'sort_order'}
    assert (body['code'], body['designation']) == ('25', 'Garage')


async def test_create_has_the_rename_length_limits(client: AsyncClient) -> None:
    admin = await _admin(client)

    for code, designation in (
        ('x' * 11, 'Garage'),
        ('25', 'x' * 121),
        ('   ', 'Garage'),
        ('25', '   '),
    ):
        response = await _create(client, admin, code, designation)
        assert response.status_code == 422, (code, designation)
        assert response.json()['detail']['code'] == 'request_validation_failed'

    ok = await _create(client, admin, 'x' * 10, 'y' * 120)
    assert ok.status_code == 201


async def test_create_refuses_a_duplicate_global_code_or_designation(
    client: AsyncClient,
) -> None:
    admin = await _admin(client)

    code = await _create(client, admin, '05', 'Garage')
    designation = await _create(client, admin, '25', ' Piscine ')

    assert code.status_code == 409
    assert code.json()['detail']['code'] == 'lot_code_conflict'
    assert designation.status_code == 409
    assert designation.json()['detail']['code'] == 'lot_designation_conflict'


async def test_create_does_not_check_project_lot_codes(client: AsyncClient) -> None:
    admin = await _admin(client)
    user = await create_project_context(client, email='user-shared-code@example.com')
    await create_project_lot(user.project_id, '90', 'Abri')

    response = await _create(client, admin, '90', 'Garage')

    assert response.status_code == 201
    codes = [lot['code'] for lot in await _project_lots(client, user)]
    assert codes.count('90') == 2


async def test_non_admins_and_anonymous_callers_cannot_create_or_delete(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    user = await create_project_context(client, email='not-admin-crud@example.com')
    lot_id = await global_lot_id('05')
    body = {'code': '25', 'designation': 'Garage'}

    for headers, expected in ((user.headers, 403), ({}, 401)):
        created = await client.post(ADMIN_LOTS_URL, headers=headers, json=body)
        deleted = await client.delete(f'{ADMIN_LOTS_URL}{lot_id}', headers=headers)
        assert created.status_code == expected
        assert deleted.status_code == expected

    assert await _count(db_session, Lot) == len(DEFAULT_LOTS)
    assert await _count(db_session, Lot, Lot.id == lot_id) == 1


async def test_new_lots_are_listed_last_in_creation_order(client: AsyncClient) -> None:
    admin = await _admin(client)

    first = await _create(client, admin, '25', 'Garage')
    second = await _create(client, admin, 'A1', 'Abri de jardin')

    assert first.status_code == second.status_code == 201
    expected = [*DEFAULT_CODES, '25', 'A1']
    assert await _global_codes(client, admin) == expected
    project_codes = [lot['code'] for lot in await _project_lots(client, admin)]
    assert project_codes == expected


async def test_a_new_lot_is_visible_in_every_project_at_once(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await _admin(client)
    first = await create_project_context(client, email='first-user@example.com')
    second = await create_project_context(client, email='second-user@example.com')

    created = await _create(client, admin, '25', 'Garage')
    lot_id = created.json()['id']

    for context in (first, second):
        lot = next(
            lot for lot in await _project_lots(client, context) if lot['id'] == lot_id
        )
        assert lot['is_global'] is True
        assert lot['is_hidden'] is False
    assert (
        await _count(db_session, ProjectHiddenLot, ProjectHiddenLot.lot_id == lot_id)
        == 0
    )


# --- Delete --------------------------------------------------------------------


async def test_deleting_a_missing_or_project_lot_is_a_404(client: AsyncClient) -> None:
    admin = await _admin(client)
    project_lot_id = await create_project_lot(admin.project_id, '90', 'Abri')

    for lot_id in (999_999, project_lot_id):
        response = await client.delete(
            f'{ADMIN_LOTS_URL}{lot_id}', headers=admin.headers
        )
        assert response.status_code == 404, lot_id
        assert response.json()['detail']['code'] == 'lot_not_found'


async def test_a_lot_used_by_an_active_transaction_cannot_be_deleted(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await _admin(client)
    user = await create_project_context(client, email='active-user@example.com')
    lot_id = await global_lot_id('12')
    await create_transaction(client, user, quote_payload(lot_id))

    response = await client.delete(f'{ADMIN_LOTS_URL}{lot_id}', headers=admin.headers)

    assert response.status_code == 409
    assert response.json()['detail'] == {
        'code': 'lot_in_use',
        'message': 'A lot used by a transaction cannot be deleted',
        'field': 'lot_id',
    }
    assert await _count(db_session, Lot, Lot.id == lot_id) == 1


async def test_a_lot_used_only_by_a_trashed_transaction_cannot_be_deleted(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await _admin(client)
    user = await create_project_context(client, email='trashed-user@example.com')
    lot_id = await global_lot_id('12')
    transaction = await create_transaction(client, user, quote_payload(lot_id))
    trashed = await client.delete(
        f'{user.transactions_url}{transaction["id"]}', headers=user.headers
    )
    assert trashed.status_code == 200

    response = await client.delete(f'{ADMIN_LOTS_URL}{lot_id}', headers=admin.headers)

    assert response.status_code == 409
    assert response.json()['detail']['code'] == 'lot_in_use'
    assert 'context' not in response.json()['detail']
    assert await _count(db_session, Lot, Lot.id == lot_id) == 1


async def test_delete_removes_the_lot_with_its_hidden_and_supplier_rows(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await _admin(client)
    users = [
        await create_project_context(client, email=f'links-{index}@example.com')
        for index in range(2)
    ]
    lot_id = await global_lot_id('22')
    other_lot_id = await global_lot_id('23')
    for context in users:
        supplier_id = await create_supplier(
            client, context, f'Pisciniste {context.user_id}'
        )
        for target in (lot_id, other_lot_id):
            assigned = await client.post(
                f'/projects/{context.project_id}/supplier-lots/',
                headers=context.headers,
                json={'supplier_id': supplier_id, 'lot_id': target},
            )
            assert assigned.status_code == 201
            hidden = await client.patch(
                f'/projects/{context.project_id}/lots/{target}',
                headers=context.headers,
                json={'is_hidden': True},
            )
            assert hidden.status_code == 200
    assert (
        await _count(db_session, ProjectHiddenLot, ProjectHiddenLot.lot_id == lot_id)
        == 2
    )
    assert await _count(db_session, SupplierLot, SupplierLot.lot_id == lot_id) == 2

    response = await client.delete(f'{ADMIN_LOTS_URL}{lot_id}', headers=admin.headers)

    assert response.status_code == 204
    assert await _count(db_session, Lot, Lot.id == lot_id) == 0
    assert (
        await _count(db_session, ProjectHiddenLot, ProjectHiddenLot.lot_id == lot_id)
        == 0
    )
    assert await _count(db_session, SupplierLot, SupplierLot.lot_id == lot_id) == 0
    # The other lot's rows, in both projects, are untouched.
    assert (
        await _count(
            db_session, ProjectHiddenLot, ProjectHiddenLot.lot_id == other_lot_id
        )
        == 2
    )
    assert (
        await _count(db_session, SupplierLot, SupplierLot.lot_id == other_lot_id) == 2
    )


async def test_a_deleted_lot_is_gone_from_every_list_and_picker(
    client: AsyncClient,
) -> None:
    admin = await _admin(client)
    user = await create_project_context(client, email='gone-user@example.com')
    lot_id = await global_lot_id('22')

    response = await client.delete(f'{ADMIN_LOTS_URL}{lot_id}', headers=admin.headers)
    assert response.status_code == 204

    assert '22' not in await _global_codes(client, admin)
    for context in (admin, user):
        assert lot_id not in [lot['id'] for lot in await _project_lots(client, context)]
        summary = await client.get(
            f'/projects/{context.project_id}/financial-summary', headers=context.headers
        )
        assert lot_id not in [lot['lot_id'] for lot in summary.json()['lots']]
    # The pickers only offer available lots: a transaction cannot use it.
    refused = await client.post(
        user.transactions_url, headers=user.headers, json=quote_payload(lot_id)
    )
    assert refused.status_code == 400
    assert refused.json()['detail']['code'] == 'lot_not_available'
    # A second delete finds nothing.
    again = await client.delete(f'{ADMIN_LOTS_URL}{lot_id}', headers=admin.headers)
    assert again.status_code == 404


async def test_a_transaction_slipping_in_after_the_check_still_blocks_the_delete(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The restrictive foreign key on transactions.lot_id turns the race into
    the same refusal, and nothing is deleted."""
    admin = await _admin(client)
    user = await create_project_context(client, email='race-user@example.com')
    lot_id = await global_lot_id('12')
    supplier_id = await create_supplier(client, user, 'Électricien Vif')
    # The transaction assigns its supplier to the lot (a supplier_lots row).
    await create_transaction(
        client, user, quote_payload(lot_id, supplier_id=supplier_id)
    )

    async def check_sees_nothing(_db: AsyncSession, _lot_id: int) -> bool:
        return False

    monkeypatch.setattr(lot_repository, '_lot_has_transactions', check_sees_nothing)

    response = await client.delete(f'{ADMIN_LOTS_URL}{lot_id}', headers=admin.headers)

    assert response.status_code == 409
    assert response.json()['detail']['code'] == 'lot_in_use'
    # Rolled back as one: the lot and its supplier row are still there.
    assert await _count(db_session, Lot, Lot.id == lot_id) == 1
    assert await _count(db_session, SupplierLot, SupplierLot.lot_id == lot_id) == 1
    assert await _count(db_session, Transaction, Transaction.lot_id == lot_id) == 1


async def test_delete_never_touches_suppliers_transactions_or_documents(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await _admin(client)
    user = await create_project_context(client, email='untouched-user@example.com')
    lot_id = await global_lot_id('22')
    supplier_id = await create_supplier(client, user, 'Pisciniste Bleu')
    transaction = await create_transaction(
        client, user, quote_payload(await global_lot_id('02'), supplier_id=supplier_id)
    )
    assigned = await client.post(
        f'/projects/{user.project_id}/supplier-lots/',
        headers=user.headers,
        json={'supplier_id': supplier_id, 'lot_id': lot_id},
    )
    assert assigned.status_code == 201
    db_session.add(
        Document(
            transaction_id=transaction['id'],
            user_id=user.user_id,
            original_filename='devis.pdf',
            stored_filename='stored-devis.pdf',
            file_path='documents/devis.pdf',
            mime_type='application/pdf',
            file_size=1234,
        )
    )
    await db_session.commit()

    response = await client.delete(f'{ADMIN_LOTS_URL}{lot_id}', headers=admin.headers)

    assert response.status_code == 204
    assert await _count(db_session, Supplier, Supplier.deleted_at.is_(None)) == 1
    assert await _count(db_session, Transaction, Transaction.deleted_at.is_(None)) == 1
    assert await _count(db_session, Document, Document.deleted_at.is_(None)) == 1


# --- Order ---------------------------------------------------------------------


async def test_order_and_moves_survive_a_delete_in_the_middle(
    client: AsyncClient,
) -> None:
    admin = await _admin(client)
    deleted = await client.delete(
        f'{ADMIN_LOTS_URL}{await global_lot_id("12")}', headers=admin.headers
    )
    assert deleted.status_code == 204
    expected = [code for code in DEFAULT_CODES if code != '12']
    assert await _global_codes(client, admin) == expected

    before, after = await global_lot_id('11'), await global_lot_id('13')

    # The former neighbours now sit next to each other.
    assert await _move(client, admin, before, 'down') == [
        *expected[:11],
        '13',
        '11',
        *expected[13:],
    ]
    assert await _move(client, admin, before, 'up') == expected
    assert await _move(client, admin, after, 'up') == [
        *expected[:11],
        '13',
        '11',
        *expected[13:],
    ]
    assert await _move(client, admin, after, 'down') == expected

    # A lot created after the delete is still last.
    created = await _create(client, admin, '25', 'Garage')
    assert created.status_code == 201
    assert await _global_codes(client, admin) == [*expected, '25']


async def test_a_created_lot_can_be_renamed_and_moved(client: AsyncClient) -> None:
    admin = await _admin(client)
    lot_id = (await _create(client, admin, '25', 'Garage')).json()['id']

    renamed = await client.patch(
        f'{ADMIN_LOTS_URL}{lot_id}',
        headers=admin.headers,
        json={'code': ' 26 ', 'designation': ' Garage double '},
    )
    assert renamed.status_code == 200
    assert (renamed.json()['code'], renamed.json()['designation']) == (
        '26',
        'Garage double',
    )
    duplicate = await client.patch(
        f'{ADMIN_LOTS_URL}{lot_id}', headers=admin.headers, json={'code': '05'}
    )
    assert duplicate.json()['detail']['code'] == 'lot_code_conflict'

    assert (await _move(client, admin, lot_id, 'up'))[-2:] == ['26', '24']
    assert (await _move(client, admin, lot_id, 'down'))[-2:] == ['24', '26']
    # Moving the last lot down changes nothing.
    assert (await _move(client, admin, lot_id, 'down'))[-1] == '26'
