"""Transactions under a project, each with one lot (spec criteria 7-15)."""

from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lot import SupplierLot
from app.models.transaction import Transaction
from tests.helpers import (
    create_project_context,
    create_supplier,
    create_transaction,
    global_lot_id,
    invoice_payload,
    quote_payload,
)


async def test_create_quote_in_a_global_lot(client: AsyncClient) -> None:
    context = await create_project_context(client, email='quote@example.com')
    lot_id = await global_lot_id('02')

    transaction = await create_transaction(
        client,
        context,
        quote_payload(
            lot_id,
            quote_status='validated',
            title='  Dalle garage  ',
            reference=' DEV-2026-14 ',
        ),
    )

    assert transaction['project_id'] == context.project_id
    assert transaction['lot_id'] == lot_id
    assert transaction['lot_code'] == '02'
    assert transaction['lot_designation'] == 'Gros œuvre / Maçonnerie'
    assert transaction['transaction_type'] == 'quote'
    assert transaction['quote_status'] == 'validated'
    assert transaction['title'] == 'Dalle garage'
    assert transaction['reference'] == 'DEV-2026-14'
    assert transaction['amount_ttc'] == '120.00'
    assert transaction['supplier_id'] is None
    # The catalog-era fields are gone from the API.
    for legacy in ('budget_line_id', 'is_selected_budget', 'product_name'):
        assert legacy not in transaction


async def test_empty_title_and_reference_are_stored_as_null(
    client: AsyncClient,
) -> None:
    context = await create_project_context(client, email='empty-title@example.com')

    transaction = await create_transaction(
        client,
        context,
        invoice_payload(await global_lot_id('00'), title='   ', reference=''),
    )

    assert transaction['title'] is None
    assert transaction['reference'] is None


@pytest.mark.parametrize(
    ('field', 'limit'),
    [('title', 255), ('reference', 100)],
)
async def test_title_and_reference_have_length_limits(
    client: AsyncClient, field: str, limit: int
) -> None:
    context = await create_project_context(client, email=f'limit-{field}@example.com')
    lot_id = await global_lot_id('00')

    await create_transaction(
        client, context, quote_payload(lot_id, **{field: 'x' * limit})
    )
    response = await client.post(
        context.transactions_url,
        headers=context.headers,
        json=quote_payload(lot_id, **{field: 'x' * (limit + 1)}),
    )

    assert response.status_code == 422
    assert response.json()['detail']['field'] == f'body.{field}'


async def test_diy_estimates_are_refused(client: AsyncClient) -> None:
    context = await create_project_context(client, email='diy@example.com')

    response = await client.post(
        context.transactions_url,
        headers=context.headers,
        json={
            'lot_id': await global_lot_id('00'),
            'transaction_type': 'diy_estimate',
            'amount_ht': '50.00',
            'vat_rate': '20.00',
            'issued_date': '2026-06-18',
        },
    )

    assert response.status_code == 400
    assert response.json()['detail']['code'] == 'transaction_type_not_supported'


async def test_lot_of_another_project_is_refused(client: AsyncClient) -> None:
    context = await create_project_context(client, email='lot-owner@example.com')
    other = await client.post(
        '/projects/', headers=context.headers, json={'name': 'Autre maison'}
    )
    other_project_id = other.json()['id']
    other_lot = await client.post(
        f'/projects/{other_project_id}/lots/',
        headers=context.headers,
        json={'code': '90', 'designation': 'Garage'},
    )
    assert other_lot.status_code == 201

    response = await client.post(
        context.transactions_url,
        headers=context.headers,
        json=quote_payload(other_lot.json()['id']),
    )

    assert response.status_code == 400
    assert response.json()['detail']['code'] == 'lot_not_available'


async def test_unknown_or_hidden_lot_is_refused(client: AsyncClient) -> None:
    context = await create_project_context(client, email='hidden-lot@example.com')
    lot_id = await global_lot_id('22')
    hidden = await client.patch(
        f'/projects/{context.project_id}/lots/{lot_id}',
        headers=context.headers,
        json={'is_hidden': True},
    )
    assert hidden.status_code == 200

    for target in (lot_id, 999_999):
        response = await client.post(
            context.transactions_url,
            headers=context.headers,
            json=quote_payload(target),
        )
        assert response.status_code == 400
        assert response.json()['detail']['code'] == 'lot_not_available'


async def test_update_moves_a_transaction_to_another_lot(client: AsyncClient) -> None:
    context = await create_project_context(client, email='move@example.com')
    transaction = await create_transaction(
        client, context, quote_payload(await global_lot_id('12'))
    )
    target_lot_id = await global_lot_id('23')

    response = await client.patch(
        f'{context.transactions_url}{transaction["id"]}',
        headers=context.headers,
        json={'lot_id': target_lot_id, 'title': 'Réseau KNX', 'reference': None},
    )

    assert response.status_code == 200
    assert response.json()['lot_id'] == target_lot_id
    assert response.json()['lot_code'] == '23'
    assert response.json()['title'] == 'Réseau KNX'


async def test_creating_with_a_supplier_assigns_it_to_the_lot(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    context = await create_project_context(client, email='assign@example.com')
    supplier_id = await create_supplier(client, context, 'Maçon Durand')
    lot_id = await global_lot_id('02')

    await create_transaction(
        client, context, quote_payload(lot_id, supplier_id=supplier_id)
    )
    await create_transaction(
        client, context, invoice_payload(lot_id, supplier_id=supplier_id)
    )

    assignments = (
        await db_session.execute(
            select(SupplierLot.supplier_id, SupplierLot.lot_id).where(
                SupplierLot.project_id == context.project_id
            )
        )
    ).all()
    assert assignments == [(supplier_id, lot_id)]


async def test_invoice_prefilled_from_a_quote_is_an_ordinary_invoice(
    client: AsyncClient,
) -> None:
    """« Ajouter une facture pour ce devis » copies the quote's lot, supplier,
    libellé, VAT rate and amount HT; the result has no link to the quote."""
    context = await create_project_context(client, email='prefill@example.com')
    supplier_id = await create_supplier(client, context, 'Charpentier Roux')
    quote = await create_transaction(
        client,
        context,
        quote_payload(
            await global_lot_id('03'),
            supplier_id=supplier_id,
            title='Charpente fermettes',
            vat_rate='10.00',
            amount_ht='8000.00',
            quote_status='validated',
        ),
    )

    invoice = await create_transaction(
        client,
        context,
        invoice_payload(
            quote['lot_id'],  # type: ignore[arg-type]
            supplier_id=quote['supplier_id'],
            title=quote['title'],
            vat_rate=quote['vat_rate'],
            amount_ht='4000.00',
            invoice_type='deposit',
        ),
    )

    assert invoice['transaction_type'] == 'invoice'
    assert invoice['amount_ttc'] == '4400.00'
    assert not any('quote_id' in key for key in invoice)


async def test_transactions_list_shows_lot_title_and_reference(
    client: AsyncClient,
) -> None:
    context = await create_project_context(client, email='list@example.com')
    await create_transaction(
        client,
        context,
        quote_payload(await global_lot_id('13'), title='Robinetterie', reference='R1'),
    )

    response = await client.get(context.transactions_url, headers=context.headers)

    assert response.status_code == 200
    [row] = response.json()
    assert (row['lot_code'], row['lot_designation']) == ('13', 'Plomberie / Sanitaires')
    assert (row['title'], row['reference']) == ('Robinetterie', 'R1')


async def test_catalog_era_routes_are_gone(client: AsyncClient) -> None:
    context = await create_project_context(client, email='gone@example.com')
    p = context.project_id

    for method, url in (
        ('GET', '/catalog/'),
        ('GET', '/catalog/categories/'),
        ('GET', '/templates/'),
        ('GET', '/templates/1/items/'),
        ('POST', '/projects/from-template'),
        ('GET', f'/projects/{p}/budget-lines/'),
        ('POST', f'/projects/{p}/products/1/transactions/'),
        ('GET', f'/projects/{p}/budget-lines/1/transactions/'),
        ('POST', f'/projects/{p}/budget-lines/1/transactions/1/select-budget'),
        ('GET', f'/projects/{p}/dashboard/widgets/budget-to-validate'),
        ('GET', f'/projects/{p}/dashboard/charts/category-distribution'),
    ):
        response = await client.request(method, url, headers=context.headers)
        assert response.status_code in {404, 405}, f'{method} {url}'


async def test_project_routes_have_no_template(client: AsyncClient) -> None:
    context = await create_project_context(client, email='no-template@example.com')

    response = await client.get(
        f'/projects/{context.project_id}', headers=context.headers
    )

    assert 'template_id' not in response.json()


# --- Database constraints (criterion 12) -------------------------------------


def _row(project_id: int, lot_id: int, **overrides: object) -> Transaction:
    values: dict[str, object] = {
        'project_id': project_id,
        'lot_id': lot_id,
        'transaction_type': 'quote',
        'quote_status': 'to_confirm',
        'amount_ht': Decimal('100.00'),
        'vat_rate': Decimal('20.00'),
        'amount_vat': Decimal('20.00'),
        'amount_ttc': Decimal('120.00'),
        'issued_date': date(2026, 1, 1),
    }
    values.update(overrides)
    return Transaction(**values)


@pytest.mark.parametrize(
    ('overrides', 'constraint'),
    [
        ({'amount_ht': Decimal('-1')}, 'ck_transactions_amount_ht_positive'),
        ({'vat_rate': Decimal('-1')}, 'ck_transactions_vat_rate_positive'),
        ({'amount_vat': Decimal('-1')}, 'ck_transactions_amount_vat_positive'),
        (
            {'amount_ht': Decimal('0'), 'amount_ttc': Decimal('-1')},
            'ck_transactions_amount_ttc_positive',
        ),
        ({'amount_ttc': Decimal('99.00')}, 'ck_transactions_ttc_greater_than_ht'),
        (
            {'transaction_type': 'invoice', 'invoice_status': 'unpaid'},
            'ck_transactions_quote_status_only_for_quotes',
        ),
        ({'invoice_status': 'unpaid'}, 'ck_transactions_invoice_status_only_for_invoices'),
        ({'invoice_type': 'full'}, 'ck_transactions_invoice_type_only_for_invoices'),
        ({'payment_method': 'wire'}, 'ck_transactions_payment_method_only_for_invoices'),
        (
            {'payment_date': date(2026, 1, 2)},
            'ck_transactions_payment_date_only_for_invoices',
        ),
        (
            {'transaction_type': 'diy_estimate', 'quote_status': None},
            'ck_transactions_type_quote_or_invoice',
        ),
    ],
)
async def test_database_constraints_still_hold(
    client: AsyncClient,
    db_session: AsyncSession,
    overrides: dict[str, object],
    constraint: str,
) -> None:
    context = await create_project_context(
        client, email=f'{constraint.replace("_", "-")}@example.com'
    )
    db_session.add(
        _row(context.project_id, await global_lot_id('00'), **overrides)
    )

    with pytest.raises(IntegrityError, match=constraint):
        await db_session.commit()
    await db_session.rollback()


async def test_due_date_constraint_is_satisfied_by_quotes_and_invoices(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """ck_transactions_due_date_only_for_quotes_or_invoices: both API types may
    carry a due date (the only other type, diy_estimate, is refused)."""
    context = await create_project_context(client, email='due-date@example.com')
    lot_id = await global_lot_id('00')
    db_session.add_all(
        [
            _row(context.project_id, lot_id, due_date=date(2026, 2, 1)),
            _row(
                context.project_id,
                lot_id,
                transaction_type='invoice',
                quote_status=None,
                invoice_status='unpaid',
                invoice_type='full',
                due_date=date(2026, 2, 1),
            ),
        ]
    )

    await db_session.commit()
