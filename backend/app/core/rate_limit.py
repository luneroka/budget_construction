"""Abuse protection for the public and cheap-to-call endpoints.

Two mechanisms:

* ``limiter`` -- slowapi per-client-IP limits, applied per route with
  ``@limiter.limit('5/minute')``. Limited routes must take ``request: Request``
  and ``response: Response`` parameters (slowapi writes the rate-limit
  headers into that response object). The client IP is what uvicorn reports, so
  behind Caddy the backend must run with ``FORWARDED_ALLOW_IPS`` set (see
  docker-compose.prod.yml), otherwise every request looks like it comes from
  the proxy.
* ``SlidingWindowThrottle`` -- a per-key (email) counter used where the
  interesting key is in the request body and therefore not available to a
  slowapi key function: failed logins per account, reset emails per address.

Both are in-process. With two uvicorn workers the effective limits are up to
twice the configured values, which is fine for this deployment; a shared
store (Redis) is the upgrade path if that ever matters.
"""

from collections import defaultdict, deque
from collections.abc import Callable
import time

from fastapi import Request, status
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.settings import settings
from app.errors import error_detail

limiter = Limiter(
    key_func=get_remote_address,
    headers_enabled=True,
    enabled=settings.rate_limit_enabled,
)

LOGIN_LIMIT = '5/minute;30/hour'
REFRESH_LIMIT = '30/minute'
FORGOT_PASSWORD_LIMIT = '3/minute;10/hour'
RESET_PASSWORD_LIMIT = '5/minute'
CONTACT_REQUEST_LIMIT = '3/hour'
ISSUE_REPORT_LIMIT = '10/hour'


async def rate_limit_exceeded_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RateLimitExceeded)
    response = JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={'detail': error_detail('rate_limited')},
    )
    # Adds Retry-After / X-RateLimit-* so well-behaved clients can back off.
    return request.app.state.limiter._inject_headers(  # pyright: ignore[reportPrivateUsage]
        response, request.state.view_rate_limit
    )


class SlidingWindowThrottle:
    """Counts events per key inside a rolling window, in memory."""

    def __init__(
        self,
        *,
        limit: int,
        window_seconds: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._clock = clock
        self._events: defaultdict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str) -> deque[float]:
        events = self._events[key]
        cutoff = self._clock() - self.window_seconds
        while events and events[0] <= cutoff:
            events.popleft()
        if not events:
            # Don't let one-off keys accumulate forever.
            del self._events[key]
            return deque()
        return events

    def is_limited(self, key: str) -> bool:
        if not settings.rate_limit_enabled:
            return False
        return len(self._prune(key)) >= self.limit

    def record(self, key: str) -> None:
        self._prune(key)
        self._events[key].append(self._clock())

    def reset(self) -> None:
        self._events.clear()


def normalize_email_key(email: str) -> str:
    return email.strip().lower()


# Failed password attempts per account. Successful logins do not count and
# clear nothing on purpose: an attacker interleaving guesses with a victim's
# real logins still gets locked out; the victim waits at most the window.
login_failures = SlidingWindowThrottle(limit=10, window_seconds=60 * 60)

# Reset emails per address, whether or not the account exists (so the
# response stays identical either way).
password_reset_requests = SlidingWindowThrottle(limit=3, window_seconds=60 * 60)

ALL_THROTTLES = (login_failures, password_reset_requests)
