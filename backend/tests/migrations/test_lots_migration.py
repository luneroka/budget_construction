"""The lots migration (ee6e9f1f2f1b) on a populated database.

The rest of the suite builds its schema from the models, so this module is
the only place Alembic runs against data: it migrates an empty database to
the revision before lots, inserts catalog-era rows, then checks the upgrade,
the downgrade and a second upgrade (spec criteria 1, 24-27).

The tests are synchronous on purpose: Alembic's env.py calls asyncio.run(),
so it runs in a subprocess, and the assertions use their own short-lived
engine.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from collections.abc import Iterator
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

BACKEND_DIR = Path(__file__).resolve().parents[2]
BEFORE_LOTS = '95ffcf47d9d2'
LOTS = 'ee6e9f1f2f1b'
DIY_NOTE = 'Ancienne estimation DIY, convertie en devis lors du passage aux lots.'

# Spec Appendix A, written out again so the test does not trust the code.
EXPECTED_LOTS = [
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


def _run(*statements: str) -> list[list[Any]]:
    """Run statements in one transaction; return the rows of each."""

    async def run() -> list[list[Any]]:
        engine = create_async_engine(os.environ['DATABASE_URL'], poolclass=NullPool)
        try:
            async with engine.begin() as connection:
                results: list[list[Any]] = []
                for statement in statements:
                    result = await connection.execute(text(statement))
                    results.append(list(result.all()) if result.returns_rows else [])
                return results
        finally:
            await engine.dispose()

    return asyncio.run(run())


def _query(statement: str) -> list[Any]:
    return _run(statement)[0]


def _scalar(statement: str) -> Any:
    return _query(statement)[0][0]


def _reset_database() -> None:
    _run(
        'DROP SCHEMA IF EXISTS analytics CASCADE',
        'DROP SCHEMA IF EXISTS public CASCADE',
        'CREATE SCHEMA public',
    )


def _alembic(*args: str) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ)
    env.pop('ALEMBIC_REFUSE_EMPTY_DATABASE', None)
    return subprocess.run(
        [sys.executable, '-m', 'alembic', *args],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )


def _migrate(revision: str, *, down: bool = False) -> None:
    result = _alembic('downgrade' if down else 'upgrade', revision)
    assert result.returncode == 0, result.stderr


# --- Catalog-era fixture ---------------------------------------------------

CATALOG = [
    # (product id, category, subcategory, product) -> expected lot code
    (1, 'Terrain & Préparation', 'Études & administratif', 'Étude de sol G2'),
    (2, 'Finitions', 'Sols', 'Parquet'),
    (3, 'Second œuvre', 'Électricité', 'Réseau KNX'),
    (4, 'Second œuvre', 'Électricité', 'Tableau électrique'),
    (5, 'Menuiseries', 'Fenêtres', 'Portes intérieures'),
    # Unmapped, but no transaction uses it: ignored by the stop rule.
    (6, 'Divers', 'Hors catalogue', 'Jamais utilisé'),
]

# (id, project, product, name)
BUDGET_LINES = [
    (1, 1, 1, 'Étude de sol G2'),
    (2, 1, 2, 'Parquet chambre'),
    (3, 1, 3, 'Réseau KNX'),
    (4, 2, 4, 'Tableau électrique'),
    (5, 2, 5, 'Portes intérieures'),
]

# id: (budget line, supplier, type, quote status, invoice status, ttc,
#      selected, deleted, description)
TRANSACTIONS: dict[int, tuple[Any, ...]] = {
    1: (1, 1, 'quote', 'validated', None, '1200.00', True, False, None),
    2: (2, 1, 'quote', 'to_confirm', None, '500.00', True, False, None),
    3: (2, None, 'quote', 'validated', None, '300.00', False, False, None),
    4: (1, None, 'quote', 'to_negotiate', None, '450.00', False, False, None),
    5: (3, None, 'diy_estimate', None, None, '250.00', True, False, 'Notes'),
    6: (3, None, 'diy_estimate', None, None, '100.00', False, False, None),
    7: (1, 1, 'invoice', None, 'paid', '600.00', False, False, None),
    8: (2, None, 'invoice', None, 'unpaid', '200.00', False, False, None),
    9: (1, 1, 'quote', 'to_confirm', None, '999.00', True, True, None),
    10: (4, 2, 'quote', 'to_confirm', None, '800.00', True, False, None),
    11: (5, 2, 'invoice', None, 'on_hold', '50.00', False, True, None),
    12: (4, None, 'diy_estimate', None, None, '70.00', True, False, ''),
}

EXPECTED_LOT_CODES = {
    1: '00', 2: '16', 3: '16', 4: '00', 5: '23', 6: '23',
    7: '00', 8: '16', 9: '00', 10: '12', 11: '11', 12: '12',
}

# (document id, transaction id)
DOCUMENTS = [(1, 1), (2, 7), (3, 11)]


def _sql_value(value: Any) -> str:
    if value is None:
        return 'NULL'
    if isinstance(value, bool):
        return 'TRUE' if value else 'FALSE'
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def _insert_catalog_era_data(
    extra_products: list[tuple[int, str, str, str]] | None = None,
) -> None:
    products = CATALOG + (extra_products or [])
    statements = [
        "INSERT INTO users (id, name, email, hashed_password, is_admin, is_active, "
        "created_at, updated_at) VALUES "
        "(1, 'A', 'a@example.com', 'x', FALSE, TRUE, now(), now()), "
        "(2, 'B', 'b@example.com', 'x', FALSE, TRUE, now(), now())",
        "INSERT INTO projects (id, user_id, name, project_status, created_at, "
        "updated_at) VALUES (1, 1, 'Maison A', 'active', now(), now()), "
        "(2, 2, 'Maison B', 'active', now(), now())",
        "INSERT INTO suppliers (id, user_id, name, created_at, updated_at) VALUES "
        "(1, 1, 'Fournisseur A', now(), now()), (2, 2, 'Fournisseur B', now(), now())",
    ]
    categories: dict[str, int] = {}
    subcategories: dict[tuple[str, str], int] = {}
    for _, category, subcategory, _ in products:
        if category not in categories:
            categories[category] = len(categories) + 1
            statements.append(
                'INSERT INTO categories (id, name, sort_order, is_active, '
                f'created_at, updated_at) VALUES ({categories[category]}, '
                f'{_sql_value(category)}, 0, TRUE, now(), now())'
            )
        if (category, subcategory) not in subcategories:
            subcategories[(category, subcategory)] = len(subcategories) + 1
            statements.append(
                'INSERT INTO subcategories (id, category_id, name, sort_order, '
                'is_active, created_at, updated_at) VALUES '
                f'({subcategories[(category, subcategory)]}, '
                f'{categories[category]}, {_sql_value(subcategory)}, 0, TRUE, '
                'now(), now())'
            )
    for product_id, category, subcategory, product in products:
        statements.append(
            'INSERT INTO products (id, subcategory_id, name, sort_order, is_active, '
            f'created_at, updated_at) VALUES ({product_id}, '
            f'{subcategories[(category, subcategory)]}, {_sql_value(product)}, 0, '
            'TRUE, now(), now())'
        )
    for line_id, project_id, product_id, name in BUDGET_LINES:
        statements.append(
            'INSERT INTO budget_lines (id, project_id, product_id, name, item_type, '
            f'sort_order, created_at, updated_at) VALUES ({line_id}, {project_id}, '
            f"{product_id}, {_sql_value(name)}, 'breakdown', 0, now(), now())"
        )
    for transaction_id, row in TRANSACTIONS.items():
        (
            line_id,
            supplier_id,
            kind,
            quote_status,
            invoice_status,
            ttc,
            selected,
            deleted,
            description,
        ) = row
        statements.append(_transaction_insert(
            transaction_id,
            line_id,
            supplier_id,
            kind,
            quote_status,
            invoice_status,
            ttc,
            selected=selected,
            deleted=deleted,
            description=description,
        ))
    for document_id, transaction_id in DOCUMENTS:
        statements.append(
            'INSERT INTO documents (id, transaction_id, user_id, original_filename, '
            'stored_filename, file_path, mime_type, file_size, created_at, '
            f'updated_at) VALUES ({document_id}, {transaction_id}, 1, '
            f"'doc{document_id}.pdf', 'doc{document_id}.pdf', "
            f"'documents/doc{document_id}.pdf', 'application/pdf', 10, now(), now())"
        )
    # The rows above set their ids; move the sequences past them.
    for table in (
        'users',
        'projects',
        'suppliers',
        'categories',
        'subcategories',
        'products',
        'budget_lines',
        'transactions',
        'documents',
    ):
        statements.append(
            f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
            f'(SELECT max(id) FROM {table}))'
        )
    _run(*statements)


def _transaction_insert(
    transaction_id: int,
    line_id: int,
    supplier_id: int | None,
    kind: str,
    quote_status: str | None,
    invoice_status: str | None,
    ttc: str,
    *,
    selected: bool = False,
    deleted: bool = False,
    description: str | None = None,
) -> str:
    amount_ttc = Decimal(ttc)
    amount_ht = (amount_ttc / Decimal('1.2')).quantize(Decimal('0.01'))
    amount_vat = amount_ttc - amount_ht
    invoice_type = 'full' if kind == 'invoice' else None
    payment_date = "'2026-03-01'" if invoice_status == 'paid' else 'NULL'
    return (
        'INSERT INTO transactions (id, budget_line_id, supplier_id, '
        'transaction_type, amount_ht, vat_rate, amount_vat, amount_ttc, '
        'issued_date, payment_date, description, quote_status, invoice_status, '
        'invoice_type, is_selected_budget, deleted_at, created_at, updated_at) '
        f'VALUES ({transaction_id}, {line_id}, {_sql_value(supplier_id)}, '
        f"'{kind}', {amount_ht}, 20.00, {amount_vat}, {amount_ttc}, "
        f"'2026-02-01', {payment_date}, {_sql_value(description)}, "
        f'{_sql_value(quote_status)}, {_sql_value(invoice_status)}, '
        f'{_sql_value(invoice_type)}, {_sql_value(selected)}, '
        f"{'now()' if deleted else 'NULL'}, now(), now())"
    )


def _expected_budget_after(project_id: int) -> Decimal:
    """Retained quotes + retained DIY estimates (active), before: what the
    validated quotes add up to after, minus the validated-but-not-retained
    quotes, which start counting (spec criterion 26)."""
    total = Decimal('0')
    for line_id, _, kind, _, _, ttc, selected, deleted, _ in TRANSACTIONS.values():
        line_project = next(line[1] for line in BUDGET_LINES if line[0] == line_id)
        if line_project != project_id or deleted or not selected:
            continue
        if kind in {'quote', 'diy_estimate'}:
            total += Decimal(ttc)
    return total


def _invoice_totals() -> list[Any]:
    return _query(
        """
        SELECT bl.project_id, t.deleted_at IS NULL AS active, sum(t.amount_ttc)
        FROM transactions t JOIN budget_lines bl ON bl.id = t.budget_line_id
        WHERE t.transaction_type = 'invoice'
        GROUP BY bl.project_id, active ORDER BY 1, 2
        """
    )


@pytest.fixture
def catalog_era_database() -> Iterator[None]:
    _reset_database()
    _migrate(BEFORE_LOTS)
    _insert_catalog_era_data()
    yield
    _reset_database()


def _assert_upgraded(invoice_totals_before: list[Any]) -> None:
    # Global lots: Appendix A, in order, codes kept as text.
    assert _query(
        'SELECT code, designation FROM lots WHERE project_id IS NULL '
        'ORDER BY sort_order'
    ) == EXPECTED_LOTS

    # Transaction count unchanged; every row has a project and a lot.
    assert _scalar('SELECT count(*) FROM transactions') == len(TRANSACTIONS)
    assert (
        _scalar(
            'SELECT count(*) FROM transactions '
            'WHERE project_id IS NULL OR lot_id IS NULL'
        )
        == 0
    )

    rows = {
        row[0]: row
        for row in _query(
            """
            SELECT t.id, t.project_id, l.code, t.title, t.transaction_type,
                   t.quote_status, t.description, bl.project_id
            FROM transactions t
            JOIN lots l ON l.id = t.lot_id
            JOIN budget_lines bl ON bl.id = t.budget_line_id
            """
        )
    }
    for transaction_id, expected_code in EXPECTED_LOT_CODES.items():
        _, project_id, code, title, *_, line_project_id = rows[transaction_id]
        assert code == expected_code, transaction_id
        assert project_id == line_project_id
        line_id = TRANSACTIONS[transaction_id][0]
        assert title == next(line[3] for line in BUDGET_LINES if line[0] == line_id)

    # DIY estimates became quotes, with the note appended, not overwritten.
    assert rows[5][4:7] == ('quote', 'validated', f'Notes\n\n{DIY_NOTE}')
    assert rows[6][4:7] == ('quote', 'to_confirm', DIY_NOTE)
    assert rows[12][4:7] == ('quote', 'validated', DIY_NOTE)
    # Retained quotes became validated; the others kept their status.
    assert rows[2][5] == 'validated'
    assert rows[9][5] == 'validated'
    assert rows[3][5] == 'validated'
    assert rows[4][5] == 'to_negotiate'
    assert _scalar(
        "SELECT count(*) FROM transactions WHERE transaction_type = 'diy_estimate'"
    ) == 0

    # Budget: retained before = validated after, except the validated quotes
    # that were not retained (transaction 3, 300.00, project 1).
    validated_after = dict(
        _query(
            """
            SELECT project_id, sum(amount_ttc) FROM transactions
            WHERE transaction_type = 'quote' AND quote_status = 'validated'
              AND deleted_at IS NULL
            GROUP BY project_id
            """
        )
    )
    assert validated_after[1] == _expected_budget_after(1) + Decimal('300.00')
    assert validated_after[2] == _expected_budget_after(2)

    # Invoices unchanged.
    assert _invoice_totals() == invoice_totals_before

    # Documents still point to the same transactions.
    assert sorted(
        _query('SELECT id, transaction_id FROM documents')
    ) == sorted(DOCUMENTS)

    # One supplier <-> lot assignment per (project, supplier, lot) found.
    assert sorted(
        _query(
            'SELECT sl.project_id, sl.supplier_id, l.code FROM supplier_lots sl '
            'JOIN lots l ON l.id = sl.lot_id'
        )
    ) == [(1, 1, '00'), (1, 1, '16'), (2, 2, '11'), (2, 2, '12')]

    # New supplier column, empty.
    assert _scalar('SELECT count(*) FROM suppliers WHERE rne_number IS NOT NULL') == 0


def test_upgrade_converts_catalog_era_data(catalog_era_database: None) -> None:
    invoice_totals_before = _invoice_totals()

    result = _alembic('upgrade', LOTS)

    assert result.returncode == 0, result.stderr
    # The conversion counts are logged.
    assert '3 retained quotes set to validated' in result.stderr
    assert '3 DIY estimates converted to quotes (2 validated, 1 to confirm)' in (
        result.stderr
    )
    assert '1 validated quotes that were not retained left unchanged' in (
        result.stderr
    )
    _assert_upgraded(invoice_totals_before)


def test_upgrade_downgrade_upgrade_round_trip(catalog_era_database: None) -> None:
    invoice_totals_before = _invoice_totals()
    _migrate(LOTS)
    _migrate(BEFORE_LOTS, down=True)

    assert _scalar("SELECT to_regclass('public.lots')") is None
    assert _scalar('SELECT count(*) FROM transactions') == len(TRANSACTIONS)
    diy_rows = _query(
        "SELECT id, description, is_selected_budget FROM transactions "
        "WHERE transaction_type = 'diy_estimate' ORDER BY id"
    )
    assert diy_rows == [(5, 'Notes', True), (6, None, False), (12, None, True)]
    assert _invoice_totals() == invoice_totals_before

    _migrate(LOTS)
    _assert_upgraded(invoice_totals_before)


def test_downgrade_deletes_lot_only_transactions(
    catalog_era_database: None,
) -> None:
    _migrate(LOTS)
    lot_id = _scalar("SELECT id FROM lots WHERE code = '05'")
    _run(
        'INSERT INTO transactions (project_id, lot_id, transaction_type, '
        'amount_ht, amount_ttc, issued_date, quote_status) VALUES '
        f"(1, {lot_id}, 'quote', 10, 12, '2026-11-18', 'to_confirm')"
    )

    _migrate(BEFORE_LOTS, down=True)

    assert _scalar('SELECT count(*) FROM transactions') == len(TRANSACTIONS)


def test_upgrade_refuses_diy_estimates_afterwards(
    catalog_era_database: None,
) -> None:
    _migrate(LOTS)

    with pytest.raises(Exception, match='ck_transactions_type_quote_or_invoice'):
        _run(
            "UPDATE transactions SET transaction_type = 'diy_estimate', "
            'quote_status = NULL WHERE id = 1'
        )


def test_upgrade_stops_on_an_unmapped_product_in_use() -> None:
    _reset_database()
    try:
        _migrate(BEFORE_LOTS)
        _insert_catalog_era_data(
            extra_products=[
                (7, 'Divers', 'Imprévus', 'Location benne'),
                (8, 'Finitions', 'Sols', 'Moquette'),
            ]
        )
        _run(
            'INSERT INTO budget_lines (id, project_id, product_id, name, item_type, '
            "sort_order, created_at, updated_at) VALUES (6, 1, 7, 'Benne', "
            "'product', 0, now(), now()), (7, 1, 8, 'Moquette', 'product', 0, "
            'now(), now())',
            _transaction_insert(20, 6, None, 'quote', 'to_confirm', None, '60.00'),
            # A soft-deleted transaction is "used" too.
            _transaction_insert(
                21, 7, None, 'quote', 'to_confirm', None, '40.00', deleted=True
            ),
        )

        result = _alembic('upgrade', LOTS)

        assert result.returncode != 0
        assert 'Divers › Imprévus › Location benne' in result.stderr
        assert 'Finitions › Sols › Moquette' in result.stderr
        # The product nobody uses is not named.
        assert 'Jamais utilisé' not in result.stderr
        # Nothing was applied: still at the revision before lots.
        assert _scalar('SELECT version_num FROM alembic_version') == BEFORE_LOTS
        assert _scalar("SELECT to_regclass('public.lots')") is None
    finally:
        _reset_database()


def test_models_match_the_migrated_schema() -> None:
    """The test suite builds its schema from the models: they must describe
    what the migrations create, or the suite tests a different database."""
    _reset_database()
    try:
        _migrate('head')

        result = _alembic('check')

        assert result.returncode == 0, result.stdout + result.stderr
        assert 'No new upgrade operations detected' in result.stdout + result.stderr
    finally:
        _reset_database()
