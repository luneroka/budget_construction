from typing import TypeVar

from fastapi import status

from app.errors import raise_api_error

T = TypeVar('T')


def require_found(value: T | None, code: str) -> T:
    """Return ``value`` or answer 404 with the given error code.

    Repositories return ``None`` for anything the current user cannot see
    (missing, soft-deleted, or owned by someone else); routers turn that
    into the same 404 regardless of the reason.
    """
    if value is None:
        raise_api_error(status.HTTP_404_NOT_FOUND, code)

    return value
