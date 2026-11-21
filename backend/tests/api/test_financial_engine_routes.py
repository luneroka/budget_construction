"""The financial engine and the dashboard, by lot and by supplier (money-model
spec criteria 1-5, 19-21).

One project holds: a lot with two suppliers (one quoted above its invoices,
one invoiced above its quote) and a « Sans fournisseur » group, every quote
and invoice status, soft-deleted rows, a lot with quotes only, a project lot
with invoices only, an empty lot and a hidden lot. VAT is 0 so TTC = HT.
"""

from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier_document import SupplierDocument, SupplierDocumentType
from tests.helpers import (
    ProjectContext,
    create_project_context,
    create_project_lot,
    create_supplier,
    create_transaction,
    global_lot_id,
    invoice_payload,
    quote_payload,
)

# The figures the money model removed (criterion 4).
REMOVED_KEYS = {'remaining_to_invoice_ttc', 'is_overrun', 'completion_percentage'}

MONEY_FIELDS = (
    'planned_cost_ttc',
    'validated_quote_amount_ttc',
    'invoiced_amount_ttc',
    'paid_invoice_amount_ttc',
    'unpaid_invoice_amount_ttc',
    'on_hold_invoice_amount_ttc',
    'to_pay_amount_ttc',
)


def _quote(lot_id: int, amount: str, status: str, **extra: object) -> dict[str, object]:
    return quote_payload(
        lot_id, amount_ht=amount, vat_rate='0.00', quote_status=status, **extra
    )


def _invoice(
    lot_id: int, amount: str, status: str, issued: str, **extra: object
) -> dict[str, object]:
    payment = {'payment_date': issued} if status == 'paid' else {}
    return invoice_payload(
        lot_id,
        amount_ht=amount,
        vat_rate='0.00',
        invoice_status=status,
        issued_date=issued,
        **payment,
        **extra,
    )


class Scenario:
    context: ProjectContext
    lot_02: int
    lot_03: int
    lot_05: int
    lot_22: int
    project_lot: int
    s1: int
    s2: int


@pytest.fixture
async def scenario(client: AsyncClient) -> Scenario:
    s = Scenario()
    s.context = await create_project_context(client, email='engine@example.com')
    s.lot_02 = await global_lot_id('02')
    s.lot_03 = await global_lot_id('03')
    s.lot_05 = await global_lot_id('05')
    s.lot_22 = await global_lot_id('22')
    s.s1 = await create_supplier(client, s.context, 'Maçon Durand')
    s.s2 = await create_supplier(client, s.context, 'Paysagiste Morel')
    s.project_lot = await create_project_lot(
        s.context.project_id, '90', 'Abri de jardin'
    )
    hidden = await client.patch(
        f'/projects/{s.context.project_id}/lots/{s.lot_22}',
        headers=s.context.headers,
        json={'is_hidden': True},
    )
    assert hidden.status_code == 200

    rows = [
        # Lot 02, Maçon Durand: every quote status; only the validated 1000
        # counts, and it is above its 650 invoiced, so its plan is 1000.
        _quote(s.lot_02, '1000.00', 'validated', supplier_id=s.s1),
        _quote(s.lot_02, '400.00', 'to_confirm', supplier_id=s.s1),
        _quote(s.lot_02, '300.00', 'to_negotiate', supplier_id=s.s1),
        _quote(s.lot_02, '900.00', 'rejected', supplier_id=s.s1),
        _invoice(s.lot_02, '600.00', 'paid', '2026-01-10', supplier_id=s.s1),
        _invoice(s.lot_02, '50.00', 'on_hold', '2026-02-20', supplier_id=s.s1),
        # Lot 02, Paysagiste Morel: invoiced 260 above its 200 quote.
        _quote(s.lot_02, '200.00', 'validated', supplier_id=s.s2),
        _invoice(s.lot_02, '260.00', 'paid', '2026-03-05', supplier_id=s.s2),
        # Lot 02, no supplier: one group, max(100, 150) = 150, not 250.
        _quote(s.lot_02, '100.00', 'validated'),
        _invoice(s.lot_02, '150.00', 'unpaid', '2026-02-10'),
        # Lot 03: quotes only.
        _quote(s.lot_03, '500.00', 'validated', supplier_id=s.s1),
        # The project's own lot: invoices only.
        _invoice(s.project_lot, '80.00', 'unpaid', '2026-03-15', supplier_id=s.s2),
    ]
    for row in rows:
        await create_transaction(client, s.context, row)

    # Soft-deleted rows never count.
    for row in (
        _quote(s.lot_02, '5000.00', 'validated', supplier_id=s.s1),
        _invoice(s.lot_02, '999.00', 'unpaid', '2026-01-15', supplier_id=s.s1),
    ):
        created = await create_transaction(client, s.context, row)
        deleted = await client.delete(
            f'{s.context.transactions_url}{created["id"]}', headers=s.context.headers
        )
        assert deleted.status_code == 200
    return s


async def _get(client: AsyncClient, s: Scenario, path: str) -> Any:
    response = await client.get(
        f'/projects/{s.context.project_id}/{path}', headers=s.context.headers
    )
    assert response.status_code == 200, response.text
    return response.json()


def _money(value: str) -> Decimal:
    return Decimal(value)


def _figures(payload: dict[str, Any]) -> dict[str, str]:
    return {field: payload[field] for field in MONEY_FIELDS}


async def test_summary_lists_every_visible_lot_with_its_figures(
    client: AsyncClient, scenario: Scenario
) -> None:
    summary = await _get(client, scenario, 'financial-summary')
    lots = {lot['lot_id']: lot for lot in summary['lots']}

    # 25 global lots minus the hidden one, then the project lot, last.
    assert len(summary['lots']) == 25
    assert scenario.lot_22 not in lots
    assert summary['lots'][0]['code'] == '00'
    assert summary['lots'][-1]['lot_id'] == scenario.project_lot
    assert summary['lots'][-1]['is_global'] is False

    lot_02 = lots[scenario.lot_02]
    assert _figures(lot_02) == {
        # 1000 (Durand's quote) + 260 (Morel's invoices) + 150 (no supplier).
        'planned_cost_ttc': '1410.00',
        'validated_quote_amount_ttc': '1300.00',
        'invoiced_amount_ttc': '1060.00',
        'paid_invoice_amount_ttc': '860.00',
        'unpaid_invoice_amount_ttc': '150.00',
        'on_hold_invoice_amount_ttc': '50.00',
        'to_pay_amount_ttc': '200.00',
    }
    assert lot_02['quote_count'] == 6
    assert lot_02['validated_quote_count'] == 3
    assert lot_02['invoice_count'] == 4


async def test_lot_supplier_groups_each_take_their_own_max(
    client: AsyncClient, scenario: Scenario
) -> None:
    summary = await _get(client, scenario, 'financial-summary')
    lot_02 = next(lot for lot in summary['lots'] if lot['lot_id'] == scenario.lot_02)
    groups = {group['supplier_id']: group for group in lot_02['suppliers']}

    # Suppliers by id, « Sans fournisseur » last.
    assert [group['supplier_id'] for group in lot_02['suppliers']] == [
        scenario.s1,
        scenario.s2,
        None,
    ]
    # Quote larger than the invoices.
    assert groups[scenario.s1]['planned_cost_ttc'] == '1000.00'
    assert groups[scenario.s1]['invoiced_amount_ttc'] == '650.00'
    assert groups[scenario.s1]['to_pay_amount_ttc'] == '50.00'
    assert groups[scenario.s1]['quote_count'] == 4
    # Invoices larger than the quote.
    assert groups[scenario.s2]['planned_cost_ttc'] == '260.00'
    assert groups[scenario.s2]['validated_quote_amount_ttc'] == '200.00'
    assert groups[scenario.s2]['to_pay_amount_ttc'] == '0.00'
    # « Sans fournisseur » is one group.
    assert groups[None]['planned_cost_ttc'] == '150.00'
    assert groups[None]['to_pay_amount_ttc'] == '150.00'

    for field in MONEY_FIELDS:
        assert _money(lot_02[field]) == sum(
            (_money(group[field]) for group in lot_02['suppliers']), Decimal('0')
        ), field


async def test_quotes_only_and_invoices_only_lots(
    client: AsyncClient, scenario: Scenario
) -> None:
    summary = await _get(client, scenario, 'financial-summary')
    lots = {lot['lot_id']: lot for lot in summary['lots']}

    quotes_only = lots[scenario.lot_03]
    assert quotes_only['planned_cost_ttc'] == '500.00'
    assert quotes_only['invoiced_amount_ttc'] == '0.00'
    assert quotes_only['to_pay_amount_ttc'] == '0.00'

    invoices_only = lots[scenario.project_lot]
    assert (invoices_only['code'], invoices_only['designation']) == (
        '90',
        'Abri de jardin',
    )
    assert invoices_only['planned_cost_ttc'] == invoices_only['invoiced_amount_ttc']
    assert invoices_only['planned_cost_ttc'] == '80.00'
    assert invoices_only['to_pay_amount_ttc'] == '80.00'


async def test_an_empty_lot_is_listed_with_zeros(
    client: AsyncClient, scenario: Scenario
) -> None:
    summary = await _get(client, scenario, 'financial-summary')
    empty = next(lot for lot in summary['lots'] if lot['lot_id'] == scenario.lot_05)

    assert all(_money(empty[field]) == 0 for field in MONEY_FIELDS)
    assert empty['quote_count'] == empty['invoice_count'] == 0
    assert empty['suppliers'] == []


async def test_project_total_is_the_sum_of_the_visible_lots(
    client: AsyncClient, scenario: Scenario
) -> None:
    summary = await _get(client, scenario, 'financial-summary')

    for field in MONEY_FIELDS:
        assert _money(summary[field]) == sum(
            (_money(lot[field]) for lot in summary['lots']), Decimal('0')
        ), field
    assert summary['planned_cost_ttc'] == '1990.00'
    assert summary['invoiced_amount_ttc'] == '1140.00'
    assert summary['paid_invoice_amount_ttc'] == '860.00'
    assert summary['to_pay_amount_ttc'] == '280.00'
    assert _money(summary['paid_invoice_amount_ttc']) + _money(
        summary['to_pay_amount_ttc']
    ) == _money(summary['invoiced_amount_ttc'])


async def test_a_supplier_in_two_lots_plans_the_sum_of_its_lot_maxes(
    client: AsyncClient, scenario: Scenario
) -> None:
    summary = await _get(client, scenario, 'financial-summary')
    suppliers = {row['supplier_id']: row for row in summary['suppliers']}

    assert [row['supplier_id'] for row in summary['suppliers']] == [
        scenario.s1,
        scenario.s2,
    ]
    # Durand: 1000 in lot 02 + 500 in lot 03.
    assert _figures(suppliers[scenario.s1]) == {
        'planned_cost_ttc': '1500.00',
        'validated_quote_amount_ttc': '1500.00',
        'invoiced_amount_ttc': '650.00',
        'paid_invoice_amount_ttc': '600.00',
        'unpaid_invoice_amount_ttc': '0.00',
        'on_hold_invoice_amount_ttc': '50.00',
        'to_pay_amount_ttc': '50.00',
    }
    # Morel: 260 in lot 02 + 80 in the project lot.
    assert suppliers[scenario.s2]['planned_cost_ttc'] == '340.00'
    assert suppliers[scenario.s2]['to_pay_amount_ttc'] == '80.00'
    assert suppliers[scenario.s1]['quote_count'] == 5
    assert suppliers[scenario.s1]['invoice_count'] == 2


async def test_removed_figures_are_absent_everywhere(
    client: AsyncClient, scenario: Scenario
) -> None:
    summary = await _get(client, scenario, 'financial-summary')
    overview = await _get(client, scenario, 'dashboard/financial-overview')

    payloads = [
        summary,
        *summary['lots'],
        *(group for lot in summary['lots'] for group in lot['suppliers']),
        *summary['suppliers'],
        overview,
    ]
    for payload in payloads:
        assert REMOVED_KEYS.isdisjoint(payload), payload


async def test_dashboard_overview_has_the_four_figures(
    client: AsyncClient, scenario: Scenario
) -> None:
    overview = await _get(client, scenario, 'dashboard/financial-overview')

    assert set(overview) == {
        'project_id',
        'generated_at',
        'planned_cost_ttc',
        'invoiced_amount_ttc',
        'paid_invoice_amount_ttc',
        'to_pay_amount_ttc',
    }
    assert overview['planned_cost_ttc'] == '1990.00'
    assert overview['invoiced_amount_ttc'] == '1140.00'
    assert overview['paid_invoice_amount_ttc'] == '860.00'
    assert overview['to_pay_amount_ttc'] == '280.00'


async def test_spending_over_time_counts_every_active_invoice(
    client: AsyncClient, scenario: Scenario
) -> None:
    points = await _get(client, scenario, 'dashboard/charts/spending-over-time')

    assert points == [
        {'month': '2026-01', 'invoiced_amount_ttc': '600.00'},
        {'month': '2026-02', 'invoiced_amount_ttc': '200.00'},
        {'month': '2026-03', 'invoiced_amount_ttc': '340.00'},
    ]


async def test_invoiced_by_lot_splits_paid_and_to_pay_for_invoiced_lots_only(
    client: AsyncClient, scenario: Scenario
) -> None:
    bars = await _get(client, scenario, 'dashboard/charts/invoiced-by-lot')

    assert bars == [
        {
            'lot_id': scenario.lot_02,
            'lot_code': '02',
            'lot_designation': 'Gros œuvre / Maçonnerie',
            'invoiced_amount_ttc': '1060.00',
            'paid_invoice_amount_ttc': '860.00',
            'to_pay_amount_ttc': '200.00',
        },
        {
            'lot_id': scenario.project_lot,
            'lot_code': '90',
            'lot_designation': 'Abri de jardin',
            'invoiced_amount_ttc': '80.00',
            'paid_invoice_amount_ttc': '0.00',
            'to_pay_amount_ttc': '80.00',
        },
    ]


async def test_supplier_distribution_counts_every_active_invoice(
    client: AsyncClient, scenario: Scenario
) -> None:
    suppliers = await _get(client, scenario, 'dashboard/charts/supplier-distribution')

    assert suppliers == [
        {
            'supplier_id': scenario.s1,
            'supplier_name': 'Maçon Durand',
            'invoiced_amount_ttc': '650.00',
        },
        {
            'supplier_id': scenario.s2,
            'supplier_name': 'Paysagiste Morel',
            'invoiced_amount_ttc': '340.00',
        },
        {
            'supplier_id': None,
            'supplier_name': 'Sans fournisseur',
            'invoiced_amount_ttc': '150.00',
        },
    ]


@pytest.mark.parametrize(
    ('widget', 'count'),
    [
        ('unpaid-invoices', 2),
        # To confirm and to negotiate, in one widget.
        ('quotes-to-follow-up', 2),
        ('missing-documents', 12),
        ('recent-transactions', 12),
    ],
)
async def test_transaction_widgets_show_lots(
    client: AsyncClient, scenario: Scenario, widget: str, count: int
) -> None:
    payload = await _get(client, scenario, f'dashboard/widgets/{widget}')

    assert payload['count'] == count
    assert len(payload['items']) == min(count, 5)
    assert set(payload['items'][0]) == {
        'transaction_id',
        'lot_id',
        'lot_code',
        'lot_designation',
        'transaction_type',
        'title',
        'reference',
        'amount_ttc',
        'issued_date',
        'due_date',
        'description',
        'quote_status',
        'invoice_status',
        'supplier_name',
        'has_documents',
    }


async def test_quotes_to_follow_up_are_to_confirm_or_to_negotiate(
    client: AsyncClient, scenario: Scenario
) -> None:
    payload = await _get(client, scenario, 'dashboard/widgets/quotes-to-follow-up')

    assert sorted(item['quote_status'] for item in payload['items']) == [
        'to_confirm',
        'to_negotiate',
    ]


@pytest.mark.parametrize(
    'path',
    [
        'dashboard/charts/budget-vs-actual',
        'dashboard/charts/lot-distribution',
        'dashboard/widgets/budget-alerts',
        'dashboard/widgets/quotes-to-confirm',
        'dashboard/widgets/quotes-to-negotiate',
        'dashboard/widgets/budget-to-validate',
    ],
)
async def test_removed_dashboard_endpoints_are_gone(
    client: AsyncClient, scenario: Scenario, path: str
) -> None:
    response = await client.get(
        f'/projects/{scenario.context.project_id}/{path}',
        headers=scenario.context.headers,
    )

    assert response.status_code == 404


async def test_new_project_sees_every_global_lot_with_zero_totals(
    client: AsyncClient,
) -> None:
    context = await create_project_context(client, email='engine-empty@example.com')

    response = await client.get(
        f'/projects/{context.project_id}/financial-summary', headers=context.headers
    )

    summary = response.json()
    assert [lot['code'] for lot in summary['lots']] == [
        f'{index:02d}' for index in range(25)
    ]
    assert all(lot['planned_cost_ttc'] == '0.00' for lot in summary['lots'])
    assert summary['planned_cost_ttc'] == '0.00'
    assert summary['suppliers'] == []


# --- Supplier documents widget (criterion 20) -------------------------------


async def _add_document(
    db_session: AsyncSession,
    *,
    supplier_id: int,
    user_id: int,
    filename: str,
    expiry_date: date | None,
) -> SupplierDocument:
    document = SupplierDocument(
        supplier_id=supplier_id,
        user_id=user_id,
        type=SupplierDocumentType.decennial_insurance,
        expiry_date=expiry_date,
        original_filename=filename,
        stored_filename=f'stored-{filename}',
        file_path=f'documents/{filename}',
        mime_type='application/pdf',
        file_size=1234,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)
    return document


async def _assign(
    client: AsyncClient, context: ProjectContext, supplier_id: int, lot_id: int
) -> None:
    response = await client.post(
        f'/projects/{context.project_id}/supplier-lots/',
        headers=context.headers,
        json={'supplier_id': supplier_id, 'lot_id': lot_id},
    )
    assert response.status_code == 201, response.text


async def test_supplier_documents_widget_lists_the_projects_suppliers_documents(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    context = await create_project_context(client, email='docs-widget@example.com')
    other_project = await client.post(
        '/projects/', headers=context.headers, json={'name': 'Autre maison'}
    )
    assert other_project.status_code == 201
    other_project_id = other_project.json()['id']
    lot_02 = await global_lot_id('02')
    lot_22 = await global_lot_id('22')

    assigned = await create_supplier(client, context, 'Couvreur Martin')
    elsewhere = await create_supplier(client, context, 'Plombier Petit')
    unassigned = await create_supplier(client, context, 'Peintre Roux')
    hidden_only = await create_supplier(client, context, 'Carreleur Blanc')
    await _assign(client, context, assigned, lot_02)
    other_context = ProjectContext(
        access_token=context.access_token,
        user_id=context.user_id,
        project_id=other_project_id,
    )
    await _assign(client, other_context, elsewhere, lot_02)
    await _assign(client, context, hidden_only, lot_22)
    hidden = await client.patch(
        f'/projects/{context.project_id}/lots/{lot_22}',
        headers=context.headers,
        json={'is_hidden': True},
    )
    assert hidden.status_code == 200

    later = await _add_document(
        db_session,
        supplier_id=assigned,
        user_id=context.user_id,
        filename='decennale-2027.pdf',
        expiry_date=date(2027, 1, 31),
    )
    sooner = await _add_document(
        db_session,
        supplier_id=assigned,
        user_id=context.user_id,
        filename='decennale-2026.pdf',
        expiry_date=date(2026, 6, 30),
    )
    # Not listed: no expiry date, binned, another project's supplier, a
    # supplier with no lot here, a supplier only in a hidden lot.
    await _add_document(
        db_session,
        supplier_id=assigned,
        user_id=context.user_id,
        filename='kbis.pdf',
        expiry_date=None,
    )
    binned = await _add_document(
        db_session,
        supplier_id=assigned,
        user_id=context.user_id,
        filename='binned.pdf',
        expiry_date=date(2026, 1, 1),
    )
    deleted = await client.delete(
        f'/supplier-documents/{binned.id}', headers=context.headers
    )
    assert deleted.status_code == 204, deleted.text
    for supplier_id, filename in (
        (elsewhere, 'other-project.pdf'),
        (unassigned, 'unassigned.pdf'),
        (hidden_only, 'hidden-lot.pdf'),
    ):
        await _add_document(
            db_session,
            supplier_id=supplier_id,
            user_id=context.user_id,
            filename=filename,
            expiry_date=date(2026, 2, 1),
        )

    response = await client.get(
        f'/projects/{context.project_id}/dashboard/widgets/supplier-documents',
        headers=context.headers,
    )

    assert response.status_code == 200, response.text
    assert response.json() == [
        {
            'id': sooner.id,
            'supplier_id': assigned,
            'supplier_name': 'Couvreur Martin',
            'type': 'decennial_insurance',
            'expiry_date': '2026-06-30',
            'original_filename': 'decennale-2026.pdf',
        },
        {
            'id': later.id,
            'supplier_id': assigned,
            'supplier_name': 'Couvreur Martin',
            'type': 'decennial_insurance',
            'expiry_date': '2027-01-31',
            'original_filename': 'decennale-2027.pdf',
        },
    ]


async def test_supplier_documents_widget_leaves_binned_suppliers_out(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    context = await create_project_context(client, email='docs-binned@example.com')
    supplier_id = await create_supplier(client, context, 'Électricien Noir')
    await _assign(client, context, supplier_id, await global_lot_id('12'))
    await _add_document(
        db_session,
        supplier_id=supplier_id,
        user_id=context.user_id,
        filename='urssaf.pdf',
        expiry_date=date(2026, 5, 1),
    )
    binned = await client.delete(f'/suppliers/{supplier_id}', headers=context.headers)
    assert binned.status_code == 200

    response = await client.get(
        f'/projects/{context.project_id}/dashboard/widgets/supplier-documents',
        headers=context.headers,
    )

    assert response.status_code == 200
    assert response.json() == []


async def test_supplier_documents_widget_never_shows_another_users_documents(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await create_project_context(client, email='docs-owner@example.com')
    intruder = await create_project_context(client, email='docs-intruder@example.com')
    supplier_id = await create_supplier(client, owner, 'Menuisier Vert')
    await _assign(client, owner, supplier_id, await global_lot_id('06'))
    await _add_document(
        db_session,
        supplier_id=supplier_id,
        user_id=owner.user_id,
        filename='rib.pdf',
        expiry_date=date(2026, 5, 1),
    )

    # Another user's project answers not found; their own project is empty.
    foreign = await client.get(
        f'/projects/{owner.project_id}/dashboard/widgets/supplier-documents',
        headers=intruder.headers,
    )
    own = await client.get(
        f'/projects/{intruder.project_id}/dashboard/widgets/supplier-documents',
        headers=intruder.headers,
    )

    assert foreign.status_code == 404
    assert own.status_code == 200
    assert own.json() == []
    stored = await db_session.execute(select(SupplierDocument.id))
    assert len(stored.scalars().all()) == 1
