"""The financial engine, by lot (spec criteria 17, 18 and 21).

One project holds, per lot: every quote status, every invoice status,
soft-deleted rows, an empty lot, a lot in overrun, a hidden lot and a
project-only lot next to the global ones. VAT is 0 so TTC = HT.
"""

from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient

from tests.helpers import (
    ProjectContext,
    create_project_context,
    create_supplier,
    create_transaction,
    global_lot_id,
    invoice_payload,
    quote_payload,
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
    project_lot = await client.post(
        f'/projects/{s.context.project_id}/lots/',
        headers=s.context.headers,
        json={'code': '90', 'designation': 'Abri de jardin'},
    )
    assert project_lot.status_code == 201
    s.project_lot = project_lot.json()['id']
    hidden = await client.patch(
        f'/projects/{s.context.project_id}/lots/{s.lot_22}',
        headers=s.context.headers,
        json={'is_hidden': True},
    )
    assert hidden.status_code == 200

    rows = [
        # Lot 02: every quote and invoice status.
        _quote(s.lot_02, '1000.00', 'validated', supplier_id=s.s1),
        _quote(s.lot_02, '400.00', 'to_confirm'),
        _quote(s.lot_02, '300.00', 'to_negotiate'),
        _quote(s.lot_02, '900.00', 'rejected'),
        _invoice(s.lot_02, '600.00', 'paid', '2026-01-10', supplier_id=s.s1),
        _invoice(s.lot_02, '150.00', 'unpaid', '2026-02-10'),
        _invoice(s.lot_02, '50.00', 'on_hold', '2026-02-20', supplier_id=s.s1),
        # Lot 03: Facturé above Devis retenus, an overrun of 30.
        _quote(s.lot_03, '100.00', 'validated'),
        _invoice(s.lot_03, '130.00', 'unpaid', '2026-03-01'),
        # The project's own lot.
        _quote(s.project_lot, '200.00', 'validated', supplier_id=s.s2),
        _invoice(s.project_lot, '50.00', 'paid', '2026-03-05', supplier_id=s.s2),
    ]
    for row in rows:
        await create_transaction(client, s.context, row)

    # Soft-deleted rows never count.
    for row in (
        _quote(s.lot_02, '5000.00', 'validated'),
        _invoice(s.lot_02, '999.00', 'unpaid', '2026-01-15'),
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


async def test_summary_lists_every_visible_lot_with_its_totals(
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
    assert lot_02['validated_quote_amount_ttc'] == '1000.00'
    assert lot_02['invoiced_amount_ttc'] == '800.00'
    assert lot_02['paid_invoice_amount_ttc'] == '600.00'
    assert lot_02['unpaid_invoice_amount_ttc'] == '150.00'
    assert lot_02['on_hold_invoice_amount_ttc'] == '50.00'
    assert lot_02['remaining_to_invoice_ttc'] == '200.00'
    assert lot_02['is_overrun'] is False
    assert lot_02['quote_count'] == 4
    assert lot_02['validated_quote_count'] == 1
    assert lot_02['invoice_count'] == 3

    lot_03 = lots[scenario.lot_03]
    assert lot_03['remaining_to_invoice_ttc'] == '-30.00'
    assert lot_03['is_overrun'] is True

    empty = lots[scenario.lot_05]
    assert empty['validated_quote_amount_ttc'] == '0.00'
    assert empty['invoiced_amount_ttc'] == '0.00'
    assert empty['quote_count'] == empty['invoice_count'] == 0

    project_lot = lots[scenario.project_lot]
    assert (project_lot['code'], project_lot['designation']) == ('90', 'Abri de jardin')
    assert project_lot['validated_quote_amount_ttc'] == '200.00'
    assert project_lot['invoiced_amount_ttc'] == '50.00'


async def test_project_total_is_the_sum_of_the_visible_lots(
    client: AsyncClient, scenario: Scenario
) -> None:
    summary = await _get(client, scenario, 'financial-summary')

    for field in (
        'validated_quote_amount_ttc',
        'invoiced_amount_ttc',
        'paid_invoice_amount_ttc',
        'unpaid_invoice_amount_ttc',
        'on_hold_invoice_amount_ttc',
        'remaining_to_invoice_ttc',
    ):
        assert _money(summary[field]) == sum(
            (_money(lot[field]) for lot in summary['lots']), Decimal('0')
        ), field
    assert summary['validated_quote_amount_ttc'] == '1300.00'
    assert summary['invoiced_amount_ttc'] == '980.00'
    assert summary['completion_percentage'] == '75.38'


async def test_dashboard_overview_uses_devis_retenus_and_facture(
    client: AsyncClient, scenario: Scenario
) -> None:
    overview = await _get(client, scenario, 'dashboard/financial-overview')

    assert set(overview) == {
        'project_id',
        'generated_at',
        'validated_quote_amount_ttc',
        'invoiced_amount_ttc',
        'remaining_to_invoice_ttc',
        'completion_percentage',
    }
    assert overview['validated_quote_amount_ttc'] == '1300.00'
    assert overview['invoiced_amount_ttc'] == '980.00'
    assert overview['remaining_to_invoice_ttc'] == '320.00'


async def test_spending_over_time_counts_every_active_invoice(
    client: AsyncClient, scenario: Scenario
) -> None:
    points = await _get(client, scenario, 'dashboard/charts/spending-over-time')

    assert points == [
        {'month': '2026-01', 'invoiced_amount_ttc': '600.00'},
        {'month': '2026-02', 'invoiced_amount_ttc': '200.00'},
        {'month': '2026-03', 'invoiced_amount_ttc': '180.00'},
    ]


async def test_budget_vs_actual_is_per_lot_with_non_zero_amounts_only(
    client: AsyncClient, scenario: Scenario
) -> None:
    bars = await _get(client, scenario, 'dashboard/charts/budget-vs-actual')

    assert bars == [
        {
            'lot_id': scenario.lot_02,
            'lot_code': '02',
            'lot_designation': 'Gros œuvre / Maçonnerie',
            'validated_quote_amount_ttc': '1000.00',
            'invoiced_amount_ttc': '800.00',
        },
        {
            'lot_id': scenario.lot_03,
            'lot_code': '03',
            'lot_designation': 'Charpente',
            'validated_quote_amount_ttc': '100.00',
            'invoiced_amount_ttc': '130.00',
        },
        {
            'lot_id': scenario.project_lot,
            'lot_code': '90',
            'lot_designation': 'Abri de jardin',
            'validated_quote_amount_ttc': '200.00',
            'invoiced_amount_ttc': '50.00',
        },
    ]


async def test_lot_distribution_shows_facture_per_lot(
    client: AsyncClient, scenario: Scenario
) -> None:
    tiles = await _get(client, scenario, 'dashboard/charts/lot-distribution')

    assert [(tile['lot_code'], tile['invoiced_amount_ttc']) for tile in tiles] == [
        ('02', '800.00'),
        ('03', '130.00'),
        ('90', '50.00'),
    ]
    assert set(tiles[0]) == {
        'lot_id',
        'lot_code',
        'lot_designation',
        'invoiced_amount_ttc',
    }


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
            'supplier_id': None,
            'supplier_name': 'Sans fournisseur',
            'invoiced_amount_ttc': '280.00',
        },
        {
            'supplier_id': scenario.s2,
            'supplier_name': 'Paysagiste Morel',
            'invoiced_amount_ttc': '50.00',
        },
    ]


async def test_budget_alerts_are_the_lots_in_overrun(
    client: AsyncClient, scenario: Scenario
) -> None:
    alerts = await _get(client, scenario, 'dashboard/widgets/budget-alerts')

    assert alerts == {
        'count': 1,
        'items': [
            {
                'lot_id': scenario.lot_03,
                'lot_code': '03',
                'lot_designation': 'Charpente',
                'validated_quote_amount_ttc': '100.00',
                'invoiced_amount_ttc': '130.00',
                'variance_ttc': '-30.00',
            }
        ],
    }


@pytest.mark.parametrize(
    ('widget', 'count'),
    [
        ('unpaid-invoices', 2),
        ('quotes-to-confirm', 1),
        ('quotes-to-negotiate', 1),
        ('missing-documents', 11),
        ('recent-transactions', 11),
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


async def test_budget_to_validate_widget_is_gone(
    client: AsyncClient, scenario: Scenario
) -> None:
    response = await client.get(
        f'/projects/{scenario.context.project_id}/dashboard/widgets/budget-to-validate',
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
    assert all(lot['invoiced_amount_ttc'] == '0.00' for lot in summary['lots'])
    assert summary['validated_quote_amount_ttc'] == '0.00'
