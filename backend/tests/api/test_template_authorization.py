from httpx import AsyncClient
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.user import User

JsonValue = None | bool | int | float | str | list['JsonValue'] | dict[str, 'JsonValue']
TemplateAuthorizationCase = tuple[str, str, JsonValue]


TEMPLATE_AUTHORIZATION_CASES: list[TemplateAuthorizationCase] = [
    (
        'POST',
        '/templates/',
        {'name': 'Unauthorized template', 'is_active': True},
    ),
    ('PATCH', '/templates/1', {'name': 'Unauthorized rename'}),
    ('DELETE', '/templates/1', None),
    (
        'POST',
        '/templates/1/items/',
        {
            'product_id': 1,
            'default_name': 'Unauthorized item',
            'sort_order': 0,
            'is_required': True,
        },
    ),
    (
        'POST',
        '/templates/1/items/bulk',
        [
            {
                'product_id': 1,
                'default_name': 'Unauthorized bulk item',
                'sort_order': 0,
                'is_required': True,
            }
        ],
    ),
    ('PATCH', '/templates/1/items/1', {'default_name': 'Unauthorized rename'}),
    ('DELETE', '/templates/1/items/1', None),
]


async def create_user_token(
    db_session: AsyncSession,
    *,
    email: str,
    is_admin: bool,
) -> str:
    user = User(
        name='Template Authorization User',
        email=email,
        hashed_password='not-used-by-token-authentication',
        is_admin=is_admin,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return create_access_token(subject=str(user.id))


@pytest.mark.parametrize(
    ('method', 'path', 'json_body'),
    TEMPLATE_AUTHORIZATION_CASES,
)
async def test_non_admin_cannot_mutate_global_templates(
    client: AsyncClient,
    db_session: AsyncSession,
    method: str,
    path: str,
    json_body: JsonValue,
) -> None:
    token = await create_user_token(
        db_session,
        email=f'non-admin-template-{method}-{path.replace("/", "-")}@example.com',
        is_admin=False,
    )

    response = await client.request(
        method,
        path,
        json=json_body,
        headers={'Authorization': f'Bearer {token}'},
    )

    assert response.status_code == 403
