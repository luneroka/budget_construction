import os
from collections.abc import AsyncIterator
from importlib import import_module
from pathlib import Path

import pytest_asyncio
from dotenv import load_dotenv
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool


load_dotenv(Path(__file__).resolve().parents[1] / '.env.test', override=True)

TEST_DATABASE_URL = os.environ['DATABASE_URL']
if 'test' not in TEST_DATABASE_URL:
    raise RuntimeError('Refusing to run tests against a non-test database')

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(bind=test_engine, expire_on_commit=False)


async def reset_test_database() -> None:
    import_module('app.models')
    from app.db.base import Base

    async with test_engine.begin() as connection:
        await connection.execute(text('DROP SCHEMA IF EXISTS public CASCADE'))
        await connection.execute(text('CREATE SCHEMA public'))
        await connection.run_sync(Base.metadata.create_all)


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    await reset_test_database()

    async with TestSessionLocal() as session:
        yield session
        await session.rollback()

    await reset_test_database()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    from app.db.session import get_db_session
    from app.main import app as fastapi_app

    async def override_get_db_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    fastapi_app.dependency_overrides[get_db_session] = override_get_db_session

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url='http://test') as test_client:
        yield test_client

    fastapi_app.dependency_overrides.clear()
