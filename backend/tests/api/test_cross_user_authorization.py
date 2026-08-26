"""Every user-owned resource must be invisible to other users.

One matrix, so adding a route without an ownership filter fails loudly here
instead of being found by a customer. Expect 404 (not 403): the response
must not confirm that the id exists.
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


async def _build_owned_resources(db_session: AsyncSession, owner: User) -> OwnedResources:
    category = Category(name='Cross-user category', sort_order=1)
    subcategory = Subcategory(category=category, name='Cross-user sub', sort_order=1)
    product = Product(subcategory=subcategory, name='Cross-user product', sort_order=1)
    project = Project(user=owner, name='Owner project')
    budget_line = BudgetLine(
        project=project,
        product=product,
        name='Owner budget line',
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
        description='Owner transaction',
    )
    document = Document(
        transaction=transaction,
        user=owner,
        original_filename='owner.pdf',
        stored_filename='stored-owner.pdf',
        file_path='documents/owner.pdf',
        mime_type='application/pdf',
        file_size=1234,
    )
    supplier = Supplier(user=owner, name='Owner supplier')
    supplier_document = SupplierDocument(
        supplier=supplier,
        user=owner,
        original_filename='rib.pdf',
        stored_filename='stored-rib.pdf',
        file_path='documents/rib.pdf',
        mime_type='application/pdf',
        file_size=1234,
    )

    db_session.add_all([document, supplier_document])
    await db_session.commit()
    for instance in (project, budget_line, transaction, document, supplier, supplier_document):
        await db_session.refresh(instance)

    return OwnedResources(
        project_id=project.id,
        budget_line_id=budget_line.id,
        transaction_id=transaction.id,
        document_id=document.id,
        supplier_id=supplier.id,
        supplier_document_id=supplier_document.id,
    )


def _routes(r: OwnedResources) -> list[tuple[str, str, dict[str, object] | None]]:
    p, b, t, d, s, sd = (
        r.project_id,
        r.budget_line_id,
        r.transaction_id,
        r.document_id,
        r.supplier_id,
        r.supplier_document_id,
    )
    return [
        ('GET', f'/projects/{p}', None),
        ('PATCH', f'/projects/{p}', {'name': 'Hijacked'}),
        ('DELETE', f'/projects/{p}', None),
        ('GET', f'/projects/{p}/financial-summary', None),
        ('GET', f'/projects/{p}/dashboard/financial-overview', None),
        ('GET', f'/projects/{p}/budget-lines/', None),
        ('GET', f'/projects/{p}/budget-lines/{b}', None),
        ('PATCH', f'/projects/{p}/budget-lines/{b}', {'name': 'Hijacked'}),
        ('DELETE', f'/projects/{p}/budget-lines/{b}', None),
        ('GET', f'/projects/{p}/transactions/', None),
        ('GET', f'/projects/{p}/budget-lines/{b}/transactions/', None),
        ('GET', f'/projects/{p}/budget-lines/{b}/transactions/{t}', None),
        (
            'PATCH',
            f'/projects/{p}/budget-lines/{b}/transactions/{t}',
            {'description': 'Hijacked'},
        ),
        ('DELETE', f'/projects/{p}/budget-lines/{b}/transactions/{t}', None),
        ('POST', f'/projects/{p}/budget-lines/{b}/transactions/{t}/select-budget', None),
        ('GET', f'/transactions/{t}/documents', None),
        ('GET', f'/documents/{d}', None),
        ('GET', f'/documents/{d}/download-url', None),
        ('DELETE', f'/documents/{d}', None),
        ('DELETE', f'/documents/{d}/permanent', None),
        ('GET', f'/suppliers/{s}', None),
        ('PATCH', f'/suppliers/{s}', {'name': 'Hijacked'}),
        ('DELETE', f'/suppliers/{s}', None),
        ('GET', f'/suppliers/{s}/documents', None),
        ('GET', f'/supplier-documents/{sd}/download-url', None),
        ('DELETE', f'/supplier-documents/{sd}', None),
        ('GET', f'/projects/{p}/trash/', None),
        ('DELETE', f'/projects/{p}/trash/', None),
        ('POST', f'/projects/{p}/trash/transactions/{t}/restore', None),
        ('DELETE', f'/projects/{p}/trash/transactions/{t}', None),
        ('GET', f'/projects/{p}/exports/accounting.csv', None),
    ]


def _route_exists(method: str, path: str) -> bool:
    scope = {'type': 'http', 'method': method, 'path': path, 'root_path': '', 'headers': []}
    return any(route.matches(scope)[0] == Match.FULL for route in fastapi_app.routes)


def test_every_matrix_entry_is_a_real_route() -> None:
    """A typo in the matrix would otherwise pass as a 404 'success'."""
    resources = OwnedResources(1, 1, 1, 1, 1, 1)
    missing = [
        f'{method} {url}'
        for method, url, _ in _routes(resources)
        if not _route_exists(method, url)
    ]
    assert missing == []


async def test_other_users_resources_are_invisible(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await create_user(email='owner-authz@example.com')
    owner = await db_session.merge(owner)
    resources = await _build_owned_resources(db_session, owner)
    attacker_token = await create_authenticated_user(
        client, email='attacker-authz@example.com'
    )
    headers = {'Authorization': f'Bearer {attacker_token}'}

    leaks: list[str] = []
    for method, url, body in _routes(resources):
        response = await client.request(method, url, headers=headers, json=body)
        if response.status_code != 404:
            leaks.append(f'{method} {url} -> {response.status_code}')

    assert leaks == []


async def test_owner_can_still_read_their_own_resources(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Guard against the matrix above passing only because the routes are broken."""
    owner = await db_session.merge(await create_user(email='owner-ok@example.com'))
    resources = await _build_owned_resources(db_session, owner)
    owner_token = await login_user(client, email='owner-ok@example.com')
    headers = {'Authorization': f'Bearer {owner_token}'}

    for url in (
        f'/projects/{resources.project_id}',
        f'/projects/{resources.project_id}/budget-lines/{resources.budget_line_id}'
        f'/transactions/{resources.transaction_id}',
        f'/documents/{resources.document_id}',
        f'/suppliers/{resources.supplier_id}',
    ):
        response = await client.get(url, headers=headers)
        assert response.status_code == 200, url
