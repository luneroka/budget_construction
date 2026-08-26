"""Password policy shared by every place a password is set.

Length is the only rule worth enforcing: composition rules push people to
predictable substitutions, and bcrypt ignores anything past 72 bytes, so
the upper bound is a correctness limit rather than a policy choice.
"""

from typing import Annotated

from pydantic import AfterValidator, Field

MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_BYTES = 72


def _check_password(value: str) -> str:
    if len(value.encode('utf-8')) > MAX_PASSWORD_BYTES:
        raise ValueError(f'Password must be at most {MAX_PASSWORD_BYTES} bytes')
    if value.strip() != value:
        raise ValueError('Password must not start or end with whitespace')
    return value


Password = Annotated[
    str,
    Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_BYTES),
    AfterValidator(_check_password),
]
