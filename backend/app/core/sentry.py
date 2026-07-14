import logging

import sentry_sdk

from app.core.settings import settings

logger = logging.getLogger(__name__)


def init_sentry() -> None:
    """Initialize Sentry for exception capture, if configured.

    A no-op when SENTRY_DSN is unset -- local development never sends
    events anywhere, and sentry_sdk.capture_exception() elsewhere in the
    app becomes a safe no-op too once no client is initialized.
    """
    if not settings.sentry_dsn:
        return

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_environment,
        # Error capture only, no performance tracing -- keep this
        # deliberately off rather than sampling by default; enable later
        # if request tracing is ever wanted.
        traces_sample_rate=0.0,
        # We attach user context explicitly (see set_user in the auth
        # dependency) instead of relying on automatic IP/header/cookie
        # capture, to keep this opt-in and specific.
        send_default_pii=False,
    )
    logger.info('Sentry initialized for environment=%s', settings.app_environment)
