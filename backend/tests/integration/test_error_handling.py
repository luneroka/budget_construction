import logging
from typing import cast

from httpx import ASGITransport, AsyncClient
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
import sentry_sdk

from app.main import HealthCheckAccessLogFilter, app as fastapi_app


async def test_unhandled_exception_returns_clean_500_json(
    db_session: AsyncSession,
    client: AsyncClient,
) -> None:
    """A route dependency raising an unexpected error must not leak a
    traceback to the client or crash the request -- it should be caught by
    the generic handler and returned as a normal structured error body.

    Starlette's ServerErrorMiddleware sends the response and then
    re-raises the exception (so the ASGI server can still log it, exactly
    what makes this recoverable without a user report in production under
    uvicorn). httpx's ASGITransport surfaces that re-raise to the caller by
    default since there's no real server absorbing it -- raise_app_exceptions
    =False here reproduces what a real client actually receives.
    """
    from app.dependencies.auth import get_current_user

    async def boom() -> None:
        raise RuntimeError('boom: simulated unexpected failure')

    fastapi_app.dependency_overrides[get_current_user] = boom
    try:
        transport = ASGITransport(app=fastapi_app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url='http://test') as raw_client:
            response = await raw_client.get('/users/me')
    finally:
        del fastapi_app.dependency_overrides[get_current_user]

    assert response.status_code == 500
    payload = cast(dict[str, object], response.json())
    detail = cast(dict[str, object], payload['detail'])
    assert detail['code'] == 'internal_server_error'
    assert detail['message'] == 'Internal server error'
    # The raw exception message must never reach the client.
    assert 'boom' not in response.text


async def test_unhandled_exception_is_sent_to_sentry(
    db_session: AsyncSession,
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.dependencies.auth import get_current_user

    captured: list[Exception] = []
    monkeypatch.setattr(sentry_sdk, 'capture_exception', captured.append)

    async def boom() -> None:
        raise RuntimeError('boom: should reach sentry_sdk.capture_exception')

    fastapi_app.dependency_overrides[get_current_user] = boom
    try:
        transport = ASGITransport(app=fastapi_app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url='http://test') as raw_client:
            await raw_client.get('/users/me')
    finally:
        del fastapi_app.dependency_overrides[get_current_user]

    assert len(captured) == 1
    assert isinstance(captured[0], RuntimeError)


async def test_expected_http_exceptions_are_not_routed_to_generic_handler(
    client: AsyncClient,
) -> None:
    """A plain, expected 401 (no auth header) must still produce the normal
    HTTPException-shaped body, not the generic handler's 500 body -- proving
    the two handlers don't collide."""
    response = await client.get('/users/me')

    assert response.status_code == 401
    payload = cast(dict[str, object], response.json())
    detail = cast(dict[str, object], payload['detail'])
    assert detail.get('code') != 'internal_server_error'


def _make_access_log_record(path: str) -> logging.LogRecord:
    return logging.LogRecord(
        name='uvicorn.access',
        level=logging.INFO,
        pathname=__file__,
        lineno=0,
        msg='%s - "%s %s HTTP/%s" %d',
        args=('127.0.0.1:12345', 'GET', path, '1.1', 200),
        exc_info=None,
    )


def test_healthcheck_paths_are_filtered_from_access_log() -> None:
    log_filter = HealthCheckAccessLogFilter()

    assert log_filter.filter(_make_access_log_record('/health/live')) is False
    assert log_filter.filter(_make_access_log_record('/health/ready')) is False


def test_non_healthcheck_paths_are_not_filtered() -> None:
    log_filter = HealthCheckAccessLogFilter()

    assert log_filter.filter(_make_access_log_record('/users/me')) is True
    assert log_filter.filter(_make_access_log_record('/auth/login')) is True


def test_filter_is_defensive_against_unexpected_record_shapes() -> None:
    log_filter = HealthCheckAccessLogFilter()

    no_args_record = logging.LogRecord(
        name='uvicorn.access',
        level=logging.INFO,
        pathname=__file__,
        lineno=0,
        msg='some message with no args',
        args=None,
        exc_info=None,
    )

    assert log_filter.filter(no_args_record) is True
