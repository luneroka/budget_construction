from typing import cast

from httpx import AsyncClient


PASSWORD = 'Password123!'


async def register_user(
    client: AsyncClient,
    *,
    email: str,
) -> None:
    response = await client.post(
        '/auth/register',
        json={
            'name': 'Project Route User',
            'email': email,
            'password': PASSWORD,
        },
    )

    assert response.status_code == 201


async def login_user(client: AsyncClient, *, email: str) -> str:
    response = await client.post(
        '/auth/login',
        data={
            'username': email,
            'password': PASSWORD,
        },
    )
    assert response.status_code == 200

    payload = cast(dict[str, object], response.json())
    access_token = payload.get('access_token')
    assert isinstance(access_token, str)
    return access_token


async def create_project(
    client: AsyncClient,
    *,
    access_token: str,
    name: str = 'Kitchen Renovation',
) -> dict[str, object]:
    response = await client.post(
        '/projects/',
        headers={'Authorization': f'Bearer {access_token}'},
        json={
            'name': name,
            'description': 'Route-level project test',
            'location': 'Paris',
            'start_date': '2026-06-16',
            'end_date': '2026-07-16',
        },
    )
    assert response.status_code == 201
    return cast(dict[str, object], response.json())


async def create_authenticated_user(client: AsyncClient, *, email: str) -> str:
    await register_user(client, email=email)
    return await login_user(client, email=email)


async def test_create_project(client: AsyncClient) -> None:
    access_token = await create_authenticated_user(
        client,
        email='create-project-user@example.com',
    )

    project = await create_project(client, access_token=access_token)

    assert isinstance(project['id'], int)
    assert project['name'] == 'Kitchen Renovation'
    assert project['deleted_at'] is None


async def test_get_own_project(client: AsyncClient) -> None:
    access_token = await create_authenticated_user(
        client,
        email='own-project-user@example.com',
    )
    project = await create_project(client, access_token=access_token)
    project_id = project['id']
    assert isinstance(project_id, int)

    response = await client.get(
        f'/projects/{project_id}',
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert response.status_code == 200
    fetched_project = cast(dict[str, object], response.json())
    assert fetched_project['id'] == project_id
    assert fetched_project['name'] == project['name']


async def test_cannot_get_another_users_project(client: AsyncClient) -> None:
    owner_token = await create_authenticated_user(
        client,
        email='project-owner@example.com',
    )
    other_user_token = await create_authenticated_user(
        client,
        email='project-other-user@example.com',
    )
    project = await create_project(client, access_token=owner_token)
    project_id = project['id']
    assert isinstance(project_id, int)

    response = await client.get(
        f'/projects/{project_id}',
        headers={'Authorization': f'Bearer {other_user_token}'},
    )

    assert response.status_code == 404


async def test_soft_delete_project_returns_deleted_project(
    client: AsyncClient,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='delete-project-user@example.com',
    )
    project = await create_project(client, access_token=access_token)
    project_id = project['id']
    assert isinstance(project_id, int)

    response = await client.delete(
        f'/projects/{project_id}',
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert response.status_code == 200
    deleted_project = cast(dict[str, object], response.json())
    assert deleted_project['id'] == project_id
    assert deleted_project['deleted_at'] is not None


async def test_deleted_project_no_longer_appears_by_default(
    client: AsyncClient,
) -> None:
    access_token = await create_authenticated_user(
        client,
        email='deleted-project-list-user@example.com',
    )
    deleted_project = await create_project(
        client,
        access_token=access_token,
        name='Deleted Project',
    )
    active_project = await create_project(
        client,
        access_token=access_token,
        name='Active Project',
    )
    deleted_project_id = deleted_project['id']
    active_project_id = active_project['id']
    assert isinstance(deleted_project_id, int)
    assert isinstance(active_project_id, int)

    delete_response = await client.delete(
        f'/projects/{deleted_project_id}',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    assert delete_response.status_code == 200

    response = await client.get(
        '/projects/',
        headers={'Authorization': f'Bearer {access_token}'},
    )

    assert response.status_code == 200
    projects = cast(list[dict[str, object]], response.json())
    project_ids = {project['id'] for project in projects}
    assert active_project_id in project_ids
    assert deleted_project_id not in project_ids
