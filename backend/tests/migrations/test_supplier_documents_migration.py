"""The supplier documents migration (a02a0ce02bd7) on a populated table.

Like test_lots_migration.py, it migrates an empty database to the revision
before, inserts supplier documents (active and soft-deleted, of two users),
then checks the upgrade, the downgrade and a second upgrade (spec
criterion 1): every existing row becomes a RIB with no expiry date, and no
row, file name or R2 key changes.

Synchronous on purpose, for the same reason: Alembic's env.py calls
asyncio.run(), so it runs in a subprocess.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

BACKEND_DIR = Path(__file__).resolve().parents[2]
LOTS = 'ee6e9f1f2f1b'
SUPPLIER_DOCUMENT_TYPES = 'a02a0ce02bd7'

# (id, user, supplier, file name, deleted)
SUPPLIER_DOCUMENTS = [
    (1, 1, 1, 'rib-a.pdf', False),
    (2, 1, 1, 'rib-a-old.pdf', True),
    (3, 1, 2, 'rib-b.png', False),
    (4, 2, 3, 'rib-c.pdf', False),
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


def _reset_database() -> None:
    _run(
        'DROP SCHEMA IF EXISTS analytics CASCADE',
        'DROP SCHEMA IF EXISTS public CASCADE',
        'CREATE SCHEMA public',
    )


def _migrate(revision: str, *, down: bool = False) -> None:
    env = dict(os.environ)
    env.pop('ALEMBIC_REFUSE_EMPTY_DATABASE', None)
    result = subprocess.run(
        [
            sys.executable,
            '-m',
            'alembic',
            'downgrade' if down else 'upgrade',
            revision,
        ],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert result.returncode == 0, result.stderr


def _insert_supplier_documents() -> None:
    statements = [
        "INSERT INTO users (id, name, email, hashed_password, is_admin, is_active, "
        "created_at, updated_at) VALUES "
        "(1, 'A', 'a@example.com', 'x', FALSE, TRUE, now(), now()), "
        "(2, 'B', 'b@example.com', 'x', FALSE, TRUE, now(), now())",
        "INSERT INTO suppliers (id, user_id, name, created_at, updated_at) VALUES "
        "(1, 1, 'Fournisseur A', now(), now()), "
        "(2, 1, 'Fournisseur B', now(), now()), "
        "(3, 2, 'Fournisseur C', now(), now())",
    ]
    for document_id, user_id, supplier_id, filename, deleted in SUPPLIER_DOCUMENTS:
        statements.append(
            'INSERT INTO supplier_documents (id, supplier_id, user_id, '
            'original_filename, stored_filename, file_path, mime_type, file_size, '
            f'created_at, updated_at, deleted_at) VALUES ({document_id}, '
            f"{supplier_id}, {user_id}, '{filename}', 'stored-{document_id}.pdf', "
            f"'documents/user_{user_id}/supplier_{supplier_id}/stored-{document_id}"
            f".pdf', 'application/pdf', 10, now(), now(), "
            f'{"now()" if deleted else "NULL"})'
        )
    _run(*statements)


def _file_rows() -> list[Any]:
    return _query(
        'SELECT id, supplier_id, user_id, original_filename, stored_filename, '
        'file_path, deleted_at IS NOT NULL FROM supplier_documents ORDER BY id'
    )


def _columns() -> set[str]:
    return {
        row[0]
        for row in _query(
            'SELECT column_name FROM information_schema.columns '
            "WHERE table_name = 'supplier_documents'"
        )
    }


def _assert_upgraded(file_rows_before: list[Any]) -> None:
    assert _query(
        'SELECT id, type::text, expiry_date FROM supplier_documents ORDER BY id'
    ) == [(document[0], 'rib', None) for document in SUPPLIER_DOCUMENTS]
    assert _file_rows() == file_rows_before
    # NOT NULL, with the five keys and nothing else.
    assert _query(
        'SELECT is_nullable FROM information_schema.columns '
        "WHERE table_name = 'supplier_documents' AND column_name = 'type'"
    ) == [('NO',)]
    assert _query(
        'SELECT data_type FROM information_schema.columns '
        "WHERE table_name = 'supplier_documents' AND column_name = 'expiry_date'"
    ) == [('date',)]
    assert [
        row[0]
        for row in _query(
            'SELECT unnest(enum_range(NULL::supplier_document_type))::text'
        )
    ] == ['rib', 'kbis', 'decennial_insurance', 'urssaf_certificate', 'other']


@pytest.fixture
def populated_supplier_documents() -> Iterator[None]:
    _reset_database()
    _migrate(LOTS)
    _insert_supplier_documents()
    yield
    _reset_database()


def test_upgrade_makes_every_existing_document_a_rib(
    populated_supplier_documents: None,
) -> None:
    file_rows_before = _file_rows()
    assert len(file_rows_before) == len(SUPPLIER_DOCUMENTS)

    _migrate(SUPPLIER_DOCUMENT_TYPES)

    _assert_upgraded(file_rows_before)


def test_upgrade_downgrade_upgrade_round_trip(
    populated_supplier_documents: None,
) -> None:
    file_rows_before = _file_rows()
    _migrate(SUPPLIER_DOCUMENT_TYPES)
    _run(
        "UPDATE supplier_documents SET type = 'kbis', expiry_date = '2027-01-31' "
        'WHERE id = 1'
    )

    _migrate(LOTS, down=True)

    assert 'type' not in _columns()
    assert 'expiry_date' not in _columns()
    assert _query("SELECT to_regtype('supplier_document_type')") == [(None,)]
    assert _file_rows() == file_rows_before

    _migrate(SUPPLIER_DOCUMENT_TYPES)

    # The downgrade dropped what was entered: every row is a RIB again.
    _assert_upgraded(file_rows_before)
