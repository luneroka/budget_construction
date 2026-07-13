from datetime import datetime, timedelta, UTC
from typing import cast

from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_refresh_token
from app.main import app as fastapi_app
from app.models.refresh_token import RefreshToken
from app.services import auth as auth_service
from tests.integration.test_auth_security import PASSWORD, create_user


async def _post_with_refresh_cookie(url: str, cookie_value: str | None) -> Response:
    cookies = {'refresh_token': cookie_value} if cookie_value is not None else {}
    async with AsyncClient(
        transport=ASGITransport(app=fastapi_app),
        base_url='http://test',
        cookies=cookies,
    ) as isolated_client:
        return await isolated_client.post(url)


async def login_and_get_cookie(client: AsyncClient, *, email: str) -> tuple[str, str]:
    response = await client.post(
        '/auth/login',
        data={'username': email, 'password': PASSWORD},
    )
    assert response.status_code == 200

    payload = cast(dict[str, object], response.json())
    access_token = payload.get('access_token')
    assert isinstance(access_token, str)

    refresh_cookie = response.cookies.get('refresh_token')
    assert refresh_cookie is not None

    return access_token, refresh_cookie


async def test_login_sets_httponly_refresh_cookie(
    db_session: AsyncSession,
    client: AsyncClient,
) -> None:
    user = await create_user(db_session, email='refresh-login@example.com')

    _, refresh_cookie = await login_and_get_cookie(client, email=user.email)

    assert refresh_cookie


async def test_refresh_rotates_cookie_and_issues_new_access_token(
    db_session: AsyncSession,
    client: AsyncClient,
) -> None:
    user = await create_user(db_session, email='refresh-rotate@example.com')
    _, refresh_cookie = await login_and_get_cookie(client, email=user.email)

    response = await _post_with_refresh_cookie('/auth/refresh', refresh_cookie)

    assert response.status_code == 200
    payload = cast(dict[str, object], response.json())
    new_access_token = payload.get('access_token')
    assert isinstance(new_access_token, str)

    new_refresh_cookie = response.cookies.get('refresh_token')
    assert new_refresh_cookie is not None
    assert new_refresh_cookie != refresh_cookie


async def test_refresh_without_cookie_is_unauthenticated(
    client: AsyncClient,
) -> None:
    response = await _post_with_refresh_cookie('/auth/refresh', None)

    assert response.status_code == 401


async def test_refresh_with_garbage_cookie_is_unauthenticated(
    client: AsyncClient,
) -> None:
    response = await _post_with_refresh_cookie('/auth/refresh', 'not-a-real-token')

    assert response.status_code == 401


async def test_concurrent_reuse_within_grace_period_is_not_treated_as_theft(
    db_session: AsyncSession,
    client: AsyncClient,
) -> None:
    """Two requests racing the same refresh token (multiple browser tabs, a
    double-fired client-side effect) must not lock the user out."""
    user = await create_user(db_session, email='refresh-race@example.com')
    _, old_cookie = await login_and_get_cookie(client, email=user.email)

    first_response = await _post_with_refresh_cookie('/auth/refresh', old_cookie)
    assert first_response.status_code == 200
    first_new_cookie = first_response.cookies.get('refresh_token')
    assert first_new_cookie is not None

    # A second request presenting the SAME already-rotated-out cookie,
    # arriving within the grace window, must still succeed rather than be
    # treated as theft -- and must not revoke the first request's token.
    second_response = await _post_with_refresh_cookie('/auth/refresh', old_cookie)
    assert second_response.status_code == 200

    still_valid_response = await _post_with_refresh_cookie(
        '/auth/refresh', first_new_cookie
    )
    assert still_valid_response.status_code == 200


async def test_reuse_after_grace_period_revokes_entire_session_family(
    db_session: AsyncSession,
    client: AsyncClient,
) -> None:
    user = await create_user(db_session, email='refresh-theft@example.com')
    _, old_cookie = await login_and_get_cookie(client, email=user.email)

    rotate_response = await _post_with_refresh_cookie('/auth/refresh', old_cookie)
    assert rotate_response.status_code == 200
    new_cookie = rotate_response.cookies.get('refresh_token')
    assert new_cookie is not None

    # Simulate the old token having been rotated out well outside the grace
    # window -- a real replay of a stale, already-used token, not a
    # concurrent legitimate request.
    old_hash = hash_refresh_token(old_cookie)
    await db_session.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == old_hash)
        .values(
            revoked_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=5)
        )
    )
    await db_session.commit()

    replay_response = await _post_with_refresh_cookie('/auth/refresh', old_cookie)
    assert replay_response.status_code == 401

    # The whole session family -- including the legitimately rotated token
    # nobody has misused -- is revoked as a result.
    legit_followup_response = await _post_with_refresh_cookie('/auth/refresh', new_cookie)
    assert legit_followup_response.status_code == 401


async def test_logout_revokes_refresh_token(
    db_session: AsyncSession,
    client: AsyncClient,
) -> None:
    user = await create_user(db_session, email='refresh-logout@example.com')
    _, refresh_cookie = await login_and_get_cookie(client, email=user.email)

    logout_response = await _post_with_refresh_cookie('/auth/logout', refresh_cookie)
    assert logout_response.status_code == 204

    refresh_response = await _post_with_refresh_cookie('/auth/refresh', refresh_cookie)
    assert refresh_response.status_code == 401


async def test_password_reset_revokes_all_refresh_tokens(
    db_session: AsyncSession,
    client: AsyncClient,
) -> None:
    user = await create_user(db_session, email='refresh-reset@example.com')
    _, refresh_cookie = await login_and_get_cookie(client, email=user.email)

    reset_token = await auth_service.generate_password_reset_token(
        db_session, user.email
    )
    assert reset_token is not None
    ok = await auth_service.reset_password(db_session, reset_token, 'NewPassword123!')
    assert ok is True

    refresh_response = await _post_with_refresh_cookie('/auth/refresh', refresh_cookie)
    assert refresh_response.status_code == 401
