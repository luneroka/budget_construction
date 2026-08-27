from datetime import UTC, datetime


def utcnow() -> datetime:
    """Current UTC time as a naive datetime.

    Every ``DateTime`` column in the schema is timezone-naive and holds UTC,
    so this is the one way application code should produce "now".
    """
    return datetime.now(UTC).replace(tzinfo=None)
