"""The accounting CSV, by lot (spec criterion 23)."""

import csv
from datetime import UTC, datetime
from io import StringIO
from typing import cast

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.supplier import Supplier
from app.models.transaction import Transaction
from app.services.export import CSV_COLUMNS
from tests.helpers import (
    ProjectContext,
    create_project_context,
    create_transaction,
    global_lot_id,
    invoice_payload,
    quote_payload,
)

EXPECTED_HEADER = [
    'Transaction ID',
    'Transaction type',
    'Supplier',
    'Project',
    'Lot code',
    'Lot',
    'Title',
    'Reference',
    'Amount HT',
    'VAT rate (%)',
    'VAT amount',
    'Amount TTC',
    'Issued date',
    'Due date',
    'Payment date',
    'Quote status',
    'Invoice status',
    'Invoice type',
    'Payment method',
    'Description',
    'Supplier SIRET',
    'Document present',
    'Document filename(s)',
    'Original document filename(s)',
    'Created at',
    'Updated at',
]


def parse_csv(content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    text = content.decode('utf-8-sig')
    header = next(csv.reader(StringIO(text)))
    return header, list(csv.DictReader(StringIO(text)))


async def _export(
    client: AsyncClient, context: ProjectContext, **params: str
):
    return await client.get(
        f'/projects/{context.project_id}/exports/accounting.csv',
        headers=context.headers,
        params=params,
    )


async def test_header_row_names_lots_not_the_catalog(client: AsyncClient) -> None:
    context = await create_project_context(client, email='csv-header@example.com')

    response = await _export(client, context)

    assert response.status_code == 200
    header, rows = parse_csv(response.content)
    assert header == EXPECTED_HEADER
    assert CSV_COLUMNS == EXPECTED_HEADER
    assert rows == []


async def test_export_downloads_human_readable_rows(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_project_context(
        client, email='csv-rows@example.com', project_name='Maison Durand'
    )
    supplier = Supplier(
        user_id=context.user_id, name='Alpha Renovation', siret='12345678901234'
    )
    db_session.add(supplier)
    await db_session.commit()
    await db_session.refresh(supplier)

    invoice = await create_transaction(
        client,
        context,
        invoice_payload(
            await global_lot_id('02'),
            supplier_id=supplier.id,
            title='Fondations',
            reference='FA-2026-7',
            amount_ht='120.00',
            issued_date='2026-06-20',
            due_date='2026-07-20',
            payment_date='2026-06-25',
            invoice_status='paid',
            invoice_type='deposit',
            payment_method='wire',
            description='Foundation invoice',
        ),
    )
    db_session.add_all(
        [
            Document(
                transaction_id=cast(int, invoice['id']),
                user_id=context.user_id,
                original_filename='foundation-invoice.pdf',
                stored_filename='stored-foundation-invoice.pdf',
                file_path='documents/stored-foundation-invoice.pdf',
                mime_type='application/pdf',
                file_size=128,
            ),
            Document(
                transaction_id=cast(int, invoice['id']),
                user_id=context.user_id,
                original_filename='deleted-invoice.pdf',
                stored_filename='deleted-invoice.pdf',
                file_path='documents/deleted-invoice.pdf',
                mime_type='application/pdf',
                file_size=128,
                deleted_at=datetime.now(UTC).replace(tzinfo=None),
            ),
        ]
    )
    await db_session.commit()

    response = await _export(client, context)

    assert response.status_code == 200
    assert response.headers['content-type'].startswith('text/csv')
    assert (
        response.headers['content-disposition']
        == f'attachment; filename="project-{context.project_id}-accounting.csv"'
    )
    _, rows = parse_csv(response.content)
    assert len(rows) == 1
    row = rows[0]
    assert row['Transaction ID'] == str(invoice['id'])
    assert row['Transaction type'] == 'Invoice'
    assert row['Supplier'] == 'Alpha Renovation'
    assert row['Supplier SIRET'] == '12345678901234'
    assert row['Project'] == 'Maison Durand'
    assert row['Lot code'] == '02'
    assert row['Lot'] == 'Gros œuvre / Maçonnerie'
    assert row['Title'] == 'Fondations'
    assert row['Reference'] == 'FA-2026-7'
    assert row['Amount HT'] == '120.00'
    assert row['VAT rate (%)'] == '20.00'
    assert row['VAT amount'] == '24.00'
    assert row['Amount TTC'] == '144.00'
    assert row['Issued date'] == '2026-06-20'
    assert row['Due date'] == '2026-07-20'
    assert row['Payment date'] == '2026-06-25'
    assert row['Invoice status'] == 'Paid'
    assert row['Invoice type'] == 'Deposit'
    assert row['Payment method'] == 'Wire transfer'
    assert row['Description'] == 'Foundation invoice'
    assert row['Document present'] == 'Yes'
    assert row['Document filename(s)'] == 'stored-foundation-invoice.pdf'
    assert row['Original document filename(s)'] == 'foundation-invoice.pdf'


async def test_export_filters_by_date_and_transaction_type(
    client: AsyncClient,
) -> None:
    context = await create_project_context(client, email='csv-filter@example.com')
    lot_id = await global_lot_id('00')
    invoice = await create_transaction(
        client, context, invoice_payload(lot_id, issued_date='2026-06-20')
    )
    quote = await create_transaction(
        client, context, quote_payload(lot_id, issued_date='2026-06-21')
    )
    await create_transaction(
        client, context, invoice_payload(lot_id, issued_date='2026-07-01')
    )

    for transaction_type, expected_ids in {
        'all': [invoice['id'], quote['id']],
        'invoices': [invoice['id']],
        'quotes': [quote['id']],
    }.items():
        response = await _export(
            client,
            context,
            start_date='2026-06-01',
            end_date='2026-06-30',
            transaction_type=transaction_type,
        )

        assert response.status_code == 200
        _, rows = parse_csv(response.content)
        assert [row['Transaction ID'] for row in rows] == [
            str(transaction_id) for transaction_id in expected_ids
        ]


async def test_diy_estimates_filter_is_gone(client: AsyncClient) -> None:
    context = await create_project_context(client, email='csv-diy@example.com')

    response = await _export(client, context, transaction_type='diy_estimates')

    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'request_validation_failed'


async def test_export_excludes_deleted_transactions(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    context = await create_project_context(client, email='csv-deleted@example.com')
    lot_id = await global_lot_id('00')
    active = await create_transaction(client, context, invoice_payload(lot_id))
    deleted = await create_transaction(client, context, invoice_payload(lot_id))
    transaction = (
        await db_session.execute(
            select(Transaction).where(Transaction.id == deleted['id'])
        )
    ).scalar_one()
    transaction.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    await db_session.commit()

    response = await _export(client, context)

    _, rows = parse_csv(response.content)
    assert [row['Transaction ID'] for row in rows] == [str(active['id'])]


async def test_export_rejects_invalid_date_range(client: AsyncClient) -> None:
    context = await create_project_context(client, email='csv-range@example.com')

    response = await _export(
        client, context, start_date='2026-07-01', end_date='2026-06-01'
    )

    assert response.status_code == 400
