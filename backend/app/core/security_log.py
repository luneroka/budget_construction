"""Security event log.

One structured line per security-relevant event (logins, resets, session
revocations, admin actions, rate limiting) on the ``security`` logger, so
that an incident can be reconstructed from the container logs without
touching application tables. Lines look like::

    security: login_failed ip=203.0.113.9 email=someone@example.com

Values are ``key=value`` with spaces/quotes stripped so each line stays
greppable. Emails are logged in clear: this is a closed, small-user-base
product and the log is the only place a hijack attempt would show up.
"""

import logging

from fastapi import Request

logger = logging.getLogger('security')


def _clean(value: object) -> str:
    text = str(value).replace('\n', ' ').replace('\r', ' ').strip()
    return text.replace(' ', '_').replace('"', '')


def client_ip(request: Request) -> str:
    if request.client is None:
        return 'unknown'
    return request.client.host


def security_event(
    event: str, *, request: Request | None = None, level: int = logging.INFO, **fields: object
) -> None:
    parts = [event]
    if request is not None:
        parts.append(f'ip={client_ip(request)}')
    parts.extend(f'{key}={_clean(value)}' for key, value in fields.items() if value is not None)
    logger.log(level, ' '.join(parts))
