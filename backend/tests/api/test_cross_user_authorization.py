"""Every user-owned resource must be invisible to other users.

One matrix, so adding a route without an ownership filter fails loudly here
instead of being found by a customer. Expect 404 (not 403): the response
must not confirm that the id exists.

Three angles, because an ownership filter can be missing in three places:

* ``_routes``: the victim's ids everywhere they can appear in a URL,
  including creates and uploads under the victim's parents;
* ``_mixed_routes``: the victim's child ids under the attacker's own parents
  (my project + your transaction or project lot), which only a filter on the
  parent chain catches;
* ``test_body_references_to_other_users_resources_are_rejected``: the
  user-owned ids a client can put in a request body, the supplier and the
  lot.

Lots are global, so a lot proves no ownership: every check goes
transaction -> project (spec criterion 8).
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.routing import Match

from sqlalchemy import select

from app.main import app as fastapi_app
from app.models.document import Document
from app.models.lot import Lot, SupplierLot
from app.models.project import Project
from app.models.supplier import Supplier
from app.models.supplier_document import SupplierDocument, SupplierDocumentType
from app.models.transaction import (
    InvoiceStatus,
    InvoiceType,
    Transaction,
    TransactionType,
)
from app.models.user import User
from tests.helpers import create_authenticated_user, create_user, login_user


@dataclass
class OwnedResources:
    project_id: int
    project_lot_id: int
    transaction_id: int
    document_id: int
    supplier_id: int
    supplier_document_id: int
    global_lot_id: int


@dataclass
class Call:
    method: str
    url: str
    json: dict[str, object] | None = None
    files: dict[str, tuple[str, bytes, str]] | None = None
    data: dict[str, str] | None = None

    def __str__(self) -> str:
        return f'{self.method} {self.url}'


PDF_UPLOAD = {
    'file': (
        'hijack.pdf',
        b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n',
        'application/pdf',
    )
}


def _quote_body(lot_id: int, **overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        'lot_id': lot_id,
        'transaction_type': 'quote',
        'quote_status': 'to_confirm',
        'amount_ht': '100.00',
        'vat_rate': '20.00',
        'amount_vat': '20.00',
        'amount_ttc': '120.00',
        'issued_date': '2026-01-01',
        'description': 'Hijacked',
    }
    body.update(overrides)
    return body


async def _build_owned_resources(
    db_session: AsyncSession, owner: User, *, label: str
) -> OwnedResources:
    global_lot = (
        await db_session.execute(select(Lot).where(Lot.code == '00'))
    ).scalar_one()
    project = Project(user=owner, name=f'{label} project')
    project_lot = Lot(project=project, code=f'P{label[:8]}', designation=label)
    supplier = Supplier(user=owner, name=f'{label} supplier')
    transaction = Transaction(
        project=project,
        lot=global_lot,
        supplier=supplier,
        transaction_type=TransactionType.invoice,
        invoice_status=InvoiceStatus.unpaid,
        invoice_type=InvoiceType.full,
        amount_ht=Decimal('100.00'),
        vat_rate=Decimal('20.00'),
        amount_vat=Decimal('20.00'),
        amount_ttc=Decimal('120.00'),
        issued_date=date(2026, 1, 1),
        description=f'{label} transaction',
    )
    document = Document(
        transaction=transaction,
        user=owner,
        original_filename=f'{label}.pdf',
        stored_filename=f'stored-{label}.pdf',
        file_path=f'documents/{label}.pdf',
        mime_type='application/pdf',
        file_size=1234,
    )
    supplier_document = SupplierDocument(
        supplier=supplier,
        user=owner,
        type=SupplierDocumentType.rib,
        original_filename=f'{label}-rib.pdf',
        stored_filename=f'stored-{label}-rib.pdf',
        file_path=f'documents/{label}-rib.pdf',
        mime_type='application/pdf',
        file_size=1234,
    )

    db_session.add_all([project_lot, document, supplier_document])
    await db_session.commit()
    for instance in (
        project,
        project_lot,
        transaction,
        document,
        supplier,
        supplier_document,
    ):
        await db_session.refresh(instance)
    db_session.add(
        SupplierLot(
            project_id=project.id, supplier_id=supplier.id, lot_id=global_lot.id
        )
    )
    await db_session.commit()

    return OwnedResources(
        project_id=project.id,
        project_lot_id=project_lot.id,
        transaction_id=transaction.id,
        document_id=document.id,
        supplier_id=supplier.id,
        supplier_document_id=supplier_document.id,
        global_lot_id=global_lot.id,
    )


DASHBOARD_PATHS = (
    'financial-overview',
    'charts/invoiced-by-lot',
    'charts/spending-over-time',
    'charts/supplier-distribution',
    'widgets/missing-documents',
    'widgets/quotes-to-follow-up',
    'widgets/recent-transactions',
    'widgets/supplier-documents',
    'widgets/unpaid-invoices',
)


def _routes(r: OwnedResources) -> list[Call]:
    """The victim's ids everywhere they can appear in a URL."""
    p, lot, t, d, s, sd, g = (
        r.project_id,
        r.project_lot_id,
        r.transaction_id,
        r.document_id,
        r.supplier_id,
        r.supplier_document_id,
        r.global_lot_id,
    )
    tx = f'/projects/{p}/transactions'
    return [
        Call('GET', f'/projects/{p}'),
        Call('PATCH', f'/projects/{p}', {'name': 'Hijacked'}),
        Call('DELETE', f'/projects/{p}'),
        Call('GET', f'/projects/{p}/financial-summary'),
        *(Call('GET', f'/projects/{p}/dashboard/{path}') for path in DASHBOARD_PATHS),
        Call('GET', f'/projects/{p}/exports/accounting.csv'),
        Call('GET', f'/projects/{p}/lots/'),
        Call('PATCH', f'/projects/{p}/lots/{lot}', {'is_hidden': True}),
        Call('PATCH', f'/projects/{p}/lots/{g}', {'is_hidden': True}),
        Call('GET', f'/projects/{p}/supplier-lots/'),
        Call('POST', f'/projects/{p}/supplier-lots/', {'supplier_id': s, 'lot_id': g}),
        Call('DELETE', f'/projects/{p}/supplier-lots/{s}/{g}'),
        Call('GET', f'{tx}/'),
        Call('POST', f'{tx}/', _quote_body(g)),
        Call('GET', f'{tx}/{t}'),
        Call('PATCH', f'{tx}/{t}', {'description': 'Hijacked'}),
        Call('DELETE', f'{tx}/{t}'),
        Call('GET', f'/transactions/{t}/documents'),
        Call('POST', f'/transactions/{t}/documents', files=PDF_UPLOAD),
        Call('GET', f'/documents/{d}'),
        Call('GET', f'/documents/{d}/download-url'),
        Call('DELETE', f'/documents/{d}'),
        Call('DELETE', f'/documents/{d}/permanent'),
        Call('GET', f'/suppliers/{s}'),
        Call('PATCH', f'/suppliers/{s}', {'name': 'Hijacked'}),
        Call('DELETE', f'/suppliers/{s}'),
        Call('GET', f'/suppliers/{s}/documents'),
        Call(
            'POST',
            f'/suppliers/{s}/documents',
            files=PDF_UPLOAD,
            data={'type': 'kbis'},
        ),
        Call('GET', f'/supplier-documents/{sd}/download-url'),
        Call('PATCH', f'/supplier-documents/{sd}', {'type': 'kbis'}),
        Call('DELETE', f'/supplier-documents/{sd}'),
        Call('GET', f'/projects/{p}/trash/'),
        Call('DELETE', f'/projects/{p}/trash/'),
        Call('POST', f'/projects/{p}/trash/transactions/{t}/restore'),
        Call('DELETE', f'/projects/{p}/trash/transactions/{t}'),
        Call('POST', f'/projects/{p}/trash/documents/{d}/restore'),
        Call('DELETE', f'/projects/{p}/trash/documents/{d}'),
        Call('POST', f'/projects/{p}/trash/suppliers/{s}/restore'),
        Call('DELETE', f'/projects/{p}/trash/suppliers/{s}'),
        Call('POST', f'/projects/{p}/trash/supplier-documents/{sd}/restore'),
        Call('DELETE', f'/projects/{p}/trash/supplier-documents/{sd}'),
    ]


def _mixed_routes(mine: OwnedResources, theirs: OwnedResources) -> list[Call]:
    """The victim's child ids under the attacker's OWN parents. Every route
    here is one the attacker may legitimately call with their own ids, so
    only a filter on the whole parent chain turns it into a 404."""
    my_p = mine.project_id
    their_t, their_d, their_lot, their_s, g = (
        theirs.transaction_id,
        theirs.document_id,
        theirs.project_lot_id,
        theirs.supplier_id,
        theirs.global_lot_id,
    )
    return [
        Call('GET', f'/projects/{my_p}/transactions/{their_t}'),
        Call(
            'PATCH',
            f'/projects/{my_p}/transactions/{their_t}',
            {'description': 'Hijacked'},
        ),
        Call('DELETE', f'/projects/{my_p}/transactions/{their_t}'),
        Call('PATCH', f'/projects/{my_p}/lots/{their_lot}', {'is_hidden': True}),
        Call('DELETE', f'/projects/{my_p}/supplier-lots/{their_s}/{g}'),
        Call('POST', f'/projects/{my_p}/trash/transactions/{their_t}/restore'),
        Call('DELETE', f'/projects/{my_p}/trash/transactions/{their_t}'),
        Call('POST', f'/projects/{my_p}/trash/documents/{their_d}/restore'),
        Call('DELETE', f'/projects/{my_p}/trash/documents/{their_d}'),
    ]


def _route_exists(method: str, path: str) -> bool:
    scope = {
        'type': 'http',
        'method': method,
        'path': path,
        'root_path': '',
        'headers': [],
    }
    return any(route.matches(scope)[0] == Match.FULL for route in fastapi_app.routes)


def test_every_matrix_entry_is_a_real_route() -> None:
    """A typo in the matrix would otherwise pass as a 404 'success'."""
    a = OwnedResources(1, 1, 1, 1, 1, 1, 1)
    b = OwnedResources(2, 2, 2, 2, 2, 2, 1)
    missing = [
        str(call)
        for call in [*_routes(a), *_mixed_routes(a, b)]
        if not _route_exists(call.method, call.url)
    ]
    assert missing == []


async def _leaks(
    client: AsyncClient, headers: dict[str, str], calls: list[Call]
) -> list[str]:
    leaks: list[str] = []
    for call in calls:
        response = await client.request(
            call.method,
            call.url,
            headers=headers,
            json=call.json,
            files=call.files,
            data=call.data,
        )
        if response.status_code != 404:
            leaks.append(f'{call} -> {response.status_code} {response.text[:700]}')
    return leaks


async def test_other_users_resources_are_invisible(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await db_session.merge(await create_user(email='owner-authz@example.com'))
    resources = await _build_owned_resources(db_session, owner, label='Owner')
    attacker_token = await create_authenticated_user(
        client, email='attacker-authz@example.com'
    )
    headers = {'Authorization': f'Bearer {attacker_token}'}

    assert await _leaks(client, headers, _routes(resources)) == []


async def test_other_users_children_are_invisible_under_my_own_parents(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await db_session.merge(await create_user(email='owner-mixed@example.com'))
    theirs = await _build_owned_resources(db_session, owner, label='Victim')
    attacker = await db_session.merge(
        await create_user(email='attacker-mixed@example.com')
    )
    mine = await _build_owned_resources(db_session, attacker, label='Attacker')
    attacker_token = await login_user(client, email='attacker-mixed@example.com')
    headers = {'Authorization': f'Bearer {attacker_token}'}

    assert await _leaks(client, headers, _mixed_routes(mine, theirs)) == []


async def test_body_references_to_other_users_resources_are_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """The supplier and the lot are the user-owned ids a client can submit in
    a body: another user's supplier, or another project's lot, is refused."""
    owner = await db_session.merge(await create_user(email='owner-body@example.com'))
    theirs = await _build_owned_resources(db_session, owner, label='VictimBody')
    attacker = await db_session.merge(
        await create_user(email='attacker-body@example.com')
    )
    mine = await _build_owned_resources(db_session, attacker, label='AttackerBody')
    attacker_token = await login_user(client, email='attacker-body@example.com')
    headers = {'Authorization': f'Bearer {attacker_token}'}
    tx = f'/projects/{mine.project_id}/transactions'

    created = await client.post(
        f'{tx}/',
        headers=headers,
        json=_quote_body(mine.global_lot_id, supplier_id=theirs.supplier_id),
    )
    assert created.status_code == 400
    assert created.json()['detail']['code'] == 'supplier_not_found_or_inactive'

    in_their_lot = await client.post(
        f'{tx}/', headers=headers, json=_quote_body(theirs.project_lot_id)
    )
    assert in_their_lot.status_code == 400
    assert in_their_lot.json()['detail']['code'] == 'lot_not_available'

    moved = await client.patch(
        f'{tx}/{mine.transaction_id}',
        headers=headers,
        json={'lot_id': theirs.project_lot_id},
    )
    assert moved.status_code == 400
    assert moved.json()['detail']['code'] == 'lot_not_available'

    assigned = await client.post(
        f'/projects/{mine.project_id}/supplier-lots/',
        headers=headers,
        json={'supplier_id': theirs.supplier_id, 'lot_id': mine.global_lot_id},
    )
    assert assigned.status_code == 400
    assert assigned.json()['detail']['code'] == 'supplier_not_found_or_inactive'

    updated = await client.patch(
        f'{tx}/{mine.transaction_id}',
        headers=headers,
        json={'supplier_id': theirs.supplier_id},
    )
    assert updated.status_code == 400
    assert updated.json()['detail']['code'] == 'supplier_not_found_or_inactive'


async def test_owner_can_still_read_their_own_resources(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Guard against the matrix above passing only because the routes are broken."""
    owner = await db_session.merge(await create_user(email='owner-ok@example.com'))
    resources = await _build_owned_resources(db_session, owner, label='Ok')
    owner_token = await login_user(client, email='owner-ok@example.com')
    headers = {'Authorization': f'Bearer {owner_token}'}

    for url in (
        f'/projects/{resources.project_id}',
        f'/projects/{resources.project_id}/transactions/{resources.transaction_id}',
        f'/projects/{resources.project_id}/lots/',
        f'/projects/{resources.project_id}/supplier-lots/',
        f'/documents/{resources.document_id}',
        f'/suppliers/{resources.supplier_id}',
        f'/projects/{resources.project_id}/dashboard/widgets/unpaid-invoices',
    ):
        response = await client.get(url, headers=headers)
        assert response.status_code == 200, url
