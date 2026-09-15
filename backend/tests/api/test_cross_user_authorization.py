"""Every user-owned resource must be invisible to other users.

One matrix, so adding a route without an ownership filter fails loudly here
instead of being found by a customer. Expect 404 (not 403): the response
must not confirm that the id exists.

Three angles, because an ownership filter can be missing in three places:

* ``_routes``: the victim's ids everywhere they can appear in a URL,
  including creates and uploads under the victim's parents;
* ``_mixed_routes``: the victim's child ids under the attacker's own parents
  (my project + your budget line), which only a filter on the parent chain
  catches;
* ``test_body_references_to_other_users_resources_are_rejected``: the one
  user-owned id a client can put in a request body, the supplier.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.routing import Match

from app.main import app as fastapi_app
from app.models.budget_line import BudgetLine, BudgetLineType
from app.models.category import Category
from app.models.document import Document
from app.models.product import Product
from app.models.project import Project
from app.models.subcategory import Subcategory
from app.models.supplier import Supplier
from app.models.supplier_document import SupplierDocument
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from tests.helpers import create_authenticated_user, create_user, login_user


@dataclass
class OwnedResources:
    project_id: int
    budget_line_id: int
    transaction_id: int
    document_id: int
    supplier_id: int
    supplier_document_id: int
    product_id: int


@dataclass
class Call:
    method: str
    url: str
    json: dict[str, object] | None = None
    files: dict[str, tuple[str, bytes, str]] | None = None

    def __str__(self) -> str:
        return f'{self.method} {self.url}'


PDF_UPLOAD = {
    'file': (
        'hijack.pdf',
        b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n',
        'application/pdf',
    )
}


def _quote_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
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
    category = Category(name=f'{label} category', sort_order=1)
    subcategory = Subcategory(category=category, name=f'{label} sub', sort_order=1)
    product = Product(subcategory=subcategory, name=f'{label} product', sort_order=1)
    project = Project(user=owner, name=f'{label} project')
    budget_line = BudgetLine(
        project=project,
        product=product,
        name=f'{label} budget line',
        item_type=BudgetLineType.product,
    )
    transaction = Transaction(
        budget_line=budget_line,
        transaction_type=TransactionType.invoice,
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
    supplier = Supplier(user=owner, name=f'{label} supplier')
    supplier_document = SupplierDocument(
        supplier=supplier,
        user=owner,
        original_filename=f'{label}-rib.pdf',
        stored_filename=f'stored-{label}-rib.pdf',
        file_path=f'documents/{label}-rib.pdf',
        mime_type='application/pdf',
        file_size=1234,
    )

    db_session.add_all([document, supplier_document])
    await db_session.commit()
    for instance in (
        project,
        budget_line,
        transaction,
        document,
        supplier,
        supplier_document,
        product,
    ):
        await db_session.refresh(instance)

    return OwnedResources(
        project_id=project.id,
        budget_line_id=budget_line.id,
        transaction_id=transaction.id,
        document_id=document.id,
        supplier_id=supplier.id,
        supplier_document_id=supplier_document.id,
        product_id=product.id,
    )


DASHBOARD_PATHS = (
    'financial-overview',
    'charts/budget-vs-actual',
    'charts/category-distribution',
    'charts/spending-over-time',
    'charts/supplier-distribution',
    'widgets/budget-alerts',
    'widgets/budget-to-validate',
    'widgets/missing-documents',
    'widgets/quotes-to-confirm',
    'widgets/quotes-to-negotiate',
    'widgets/recent-transactions',
    'widgets/unpaid-invoices',
)


def _routes(r: OwnedResources) -> list[Call]:
    """The victim's ids everywhere they can appear in a URL."""
    p, b, t, d, s, sd, prod = (
        r.project_id,
        r.budget_line_id,
        r.transaction_id,
        r.document_id,
        r.supplier_id,
        r.supplier_document_id,
        r.product_id,
    )
    tx = f'/projects/{p}/budget-lines/{b}/transactions'
    return [
        Call('GET', f'/projects/{p}'),
        Call('PATCH', f'/projects/{p}', {'name': 'Hijacked'}),
        Call('DELETE', f'/projects/{p}'),
        Call('GET', f'/projects/{p}/financial-summary'),
        *(Call('GET', f'/projects/{p}/dashboard/{path}') for path in DASHBOARD_PATHS),
        Call('GET', f'/projects/{p}/exports/accounting.csv'),
        Call('GET', f'/projects/{p}/budget-lines/'),
        Call(
            'POST',
            f'/projects/{p}/budget-lines/',
            {'product_id': prod, 'name': 'Hijacked', 'item_type': 'product'},
        ),
        Call('GET', f'/projects/{p}/budget-lines/{b}'),
        Call('PATCH', f'/projects/{p}/budget-lines/{b}', {'name': 'Hijacked'}),
        Call('DELETE', f'/projects/{p}/budget-lines/{b}'),
        Call(
            'POST',
            f'/projects/{p}/products/{prod}/budget-lines/convert-to-breakdown',
            {'new_breakdown_names': ['Hijacked']},
        ),
        Call('GET', f'/projects/{p}/transactions/'),
        Call(
            'POST',
            f'/projects/{p}/products/{prod}/transactions/',
            _quote_body(budget_concern='entire_product'),
        ),
        Call('GET', f'{tx}/'),
        Call('POST', f'{tx}/', _quote_body()),
        Call('GET', f'{tx}/{t}'),
        Call('PATCH', f'{tx}/{t}', {'description': 'Hijacked'}),
        Call('DELETE', f'{tx}/{t}'),
        Call('POST', f'{tx}/{t}/select-budget'),
        Call('DELETE', f'{tx}/{t}/select-budget'),
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
        Call('POST', f'/suppliers/{s}/documents', files=PDF_UPLOAD),
        Call('GET', f'/supplier-documents/{sd}/download-url'),
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
    my_p, my_b = mine.project_id, mine.budget_line_id
    their_b, their_t, their_d = (
        theirs.budget_line_id,
        theirs.transaction_id,
        theirs.document_id,
    )
    return [
        Call('GET', f'/projects/{my_p}/budget-lines/{their_b}'),
        Call('PATCH', f'/projects/{my_p}/budget-lines/{their_b}', {'name': 'Hijacked'}),
        Call('DELETE', f'/projects/{my_p}/budget-lines/{their_b}'),
        Call('GET', f'/projects/{my_p}/budget-lines/{their_b}/transactions/'),
        Call(
            'POST',
            f'/projects/{my_p}/budget-lines/{their_b}/transactions/',
            _quote_body(),
        ),
        Call('GET', f'/projects/{my_p}/budget-lines/{their_b}/transactions/{their_t}'),
        Call('GET', f'/projects/{my_p}/budget-lines/{my_b}/transactions/{their_t}'),
        Call(
            'PATCH',
            f'/projects/{my_p}/budget-lines/{my_b}/transactions/{their_t}',
            {'description': 'Hijacked'},
        ),
        Call('DELETE', f'/projects/{my_p}/budget-lines/{my_b}/transactions/{their_t}'),
        Call(
            'POST',
            f'/projects/{my_p}/budget-lines/{my_b}/transactions/{their_t}/select-budget',
        ),
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
    b = OwnedResources(2, 2, 2, 2, 2, 2, 2)
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
            call.method, call.url, headers=headers, json=call.json, files=call.files
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
    """The supplier is the only user-owned id a client can submit in a body."""
    owner = await db_session.merge(await create_user(email='owner-body@example.com'))
    theirs = await _build_owned_resources(db_session, owner, label='VictimBody')
    attacker = await db_session.merge(
        await create_user(email='attacker-body@example.com')
    )
    mine = await _build_owned_resources(db_session, attacker, label='AttackerBody')
    attacker_token = await login_user(client, email='attacker-body@example.com')
    headers = {'Authorization': f'Bearer {attacker_token}'}
    tx = f'/projects/{mine.project_id}/budget-lines/{mine.budget_line_id}/transactions'

    created = await client.post(
        f'{tx}/', headers=headers, json=_quote_body(supplier_id=theirs.supplier_id)
    )
    assert created.status_code == 400
    assert created.json()['detail']['code'] == 'supplier_not_found_or_inactive'

    updated = await client.patch(
        f'{tx}/{mine.transaction_id}',
        headers=headers,
        # The fixture transaction is an invoice; its status fields must be
        # valid so that the supplier check is what rejects the request.
        json={
            'supplier_id': theirs.supplier_id,
            'invoice_status': 'unpaid',
            'invoice_type': 'full',
        },
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
        f'/projects/{resources.project_id}/budget-lines/{resources.budget_line_id}'
        f'/transactions/{resources.transaction_id}',
        f'/documents/{resources.document_id}',
        f'/suppliers/{resources.supplier_id}',
        f'/projects/{resources.project_id}/dashboard/widgets/unpaid-invoices',
    ):
        response = await client.get(url, headers=headers)
        assert response.status_code == 200, url
