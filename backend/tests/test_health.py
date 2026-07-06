from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


async def test_openapi_schema_is_available(client: AsyncClient) -> None:
    response = await client.get('/openapi.json')

    assert response.status_code == 200
    assert 'paths' in response.json()


async def test_local_frontend_origin_is_allowed_for_cors(
    client: AsyncClient,
) -> None:
    response = await client.options(
        '/auth/login',
        headers={
            'Origin': 'http://localhost:5173',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type',
        },
    )

    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == (
        'http://localhost:5173'
    )


async def test_test_database_starts_empty(db_session: AsyncSession) -> None:
    users_count = await db_session.scalar(select(func.count()).select_from(User))

    assert users_count == 0


async def test_register_uses_overridden_test_database(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    response = await client.post(
        '/auth/register',
        json={
            'name': 'Test User',
            'email': 'test-user@example.com',
            'password': 'password123',
        },
    )

    assert response.status_code == 201

    user = await db_session.scalar(
        select(User).where(User.email == 'test-user@example.com')
    )

    assert user is not None
    assert user.name == 'Test User'
