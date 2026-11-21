"""Migrations really commit with the production guard on.

Production's migrate service sets ALEMBIC_REFUSE_EMPTY_DATABASE=1, and the
guard's table check left a transaction open that Alembic never committed: the
v1.11.0 deploy (2026-11-21) logged both migrations and kept neither. These
tests run Alembic exactly like that service and read the result back on a
fresh connection.

Synchronous on purpose: Alembic's env.py calls asyncio.run(), so it runs in a
subprocess, as in the other migration tests.
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


def _reset_database() -> None:
    _run(
        'DROP SCHEMA IF EXISTS analytics CASCADE',
        'DROP SCHEMA IF EXISTS public CASCADE',
        'CREATE SCHEMA public',
    )


def _alembic(
    command: str, revision: str, *, refuse_empty: bool
) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ)
    if refuse_empty:
        env['ALEMBIC_REFUSE_EMPTY_DATABASE'] = '1'
    else:
        env.pop('ALEMBIC_REFUSE_EMPTY_DATABASE', None)
    return subprocess.run(
        [sys.executable, '-m', 'alembic', command, revision],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )


def _version() -> list[Any]:
    return _run('SELECT version_num FROM alembic_version')[0]


@pytest.fixture
def database_at_lots() -> Iterator[None]:
    _reset_database()
    result = _alembic('upgrade', LOTS, refuse_empty=False)
    assert result.returncode == 0, result.stderr
    yield
    _reset_database()


def test_upgrade_with_the_production_guard_is_committed(
    database_at_lots: None,
) -> None:
    assert _version() == [(LOTS,)]

    result = _alembic('upgrade', SUPPLIER_DOCUMENT_TYPES, refuse_empty=True)

    assert result.returncode == 0, result.stderr
    assert _version() == [(SUPPLIER_DOCUMENT_TYPES,)]
    assert _run(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'supplier_documents' AND column_name = 'type'"
    )[0] == [(1,)]


def test_downgrade_with_the_production_guard_is_committed(
    database_at_lots: None,
) -> None:
    upgraded = _alembic('upgrade', SUPPLIER_DOCUMENT_TYPES, refuse_empty=True)
    assert upgraded.returncode == 0, upgraded.stderr
    assert _version() == [(SUPPLIER_DOCUMENT_TYPES,)]

    result = _alembic('downgrade', LOTS, refuse_empty=True)

    assert result.returncode == 0, result.stderr
    assert _version() == [(LOTS,)]


def test_the_guard_still_refuses_a_never_migrated_database() -> None:
    _reset_database()
    try:
        result = _alembic('upgrade', 'head', refuse_empty=True)

        assert result.returncode != 0
        assert 'Refusing to migrate a database that has never been migrated' in (
            result.stderr + result.stdout
        )
        assert _run(
            "SELECT count(*) FROM information_schema.tables "
            "WHERE table_schema = 'public'"
        )[0] == [(0,)]
    finally:
        _reset_database()
