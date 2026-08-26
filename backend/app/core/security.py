from datetime import datetime, timedelta, UTC
from hashlib import sha256
import hmac
import secrets
from typing import TypeVar, cast

import jwt
from jwt import PyJWTError
from passlib.context import CryptContext

from app.core.settings import settings

T = TypeVar('T')
JWTPayload = dict[str, str | datetime]
DecodedToken = dict[str, object]
ACCESS_TOKEN_PURPOSE = 'access'
PASSWORD_RESET_TOKEN_PURPOSE = 'password_reset'
# Symmetric algorithms only: the same secret signs and verifies, and there is
# no public key for an attacker to swap in (algorithm confusion).
SUPPORTED_ALGORITHMS = frozenset({'HS256', 'HS384', 'HS512'})


class TokenError(Exception):
    """A token is malformed, expired, badly signed or of the wrong kind."""


def _require_setting(name: str, value: T | None) -> T:
    if value is None:
        raise ValueError(f'{name} must be set')
    return value


SECRET_KEY = _require_setting('SECRET_KEY', settings.secret_key)
ALGORITHM = _require_setting('ALGORITHM', settings.algorithm)
if ALGORITHM not in SUPPORTED_ALGORITHMS:
    raise ValueError(
        f'ALGORITHM must be one of {sorted(SUPPORTED_ALGORITHMS)}, got {ALGORITHM!r}'
    )
ACCESS_TOKEN_EXPIRE_MINUTES = _require_setting(
    'ACCESS_TOKEN_EXPIRE_MINUTES',
    settings.access_token_expire_minutes,
)
REFRESH_TOKEN_EXPIRE_DAYS = settings.refresh_token_expire_days

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def _password_marker(hashed_password: str) -> str:
    """HMAC of the current password hash, embedded in tokens so that any
    password change (reset, admin action) invalidates them immediately."""
    return hmac.new(
        SECRET_KEY.encode(),
        hashed_password.encode(),
        sha256,
    ).hexdigest()


def create_access_token(*, subject: str, hashed_password: str) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    payload: JWTPayload = {
        'sub': subject,
        'exp': expire,
        'purpose': ACCESS_TOKEN_PURPOSE,
        'pwd': _password_marker(hashed_password),
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_password_reset_token(
    subject: str,
    hashed_password: str,
    expires_minutes: int = 15,
) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=expires_minutes)

    payload: JWTPayload = {
        'sub': subject,
        'exp': expire,
        'purpose': PASSWORD_RESET_TOKEN_PURPOSE,
        'pwd': _password_marker(hashed_password),
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_password_reset_token(token: str) -> DecodedToken:
    return _decode_token(token, expected_purpose=PASSWORD_RESET_TOKEN_PURPOSE)


def decode_access_token(token: str) -> DecodedToken:
    return _decode_token(token, expected_purpose=ACCESS_TOKEN_PURPOSE)


def token_matches_password(payload: DecodedToken, hashed_password: str) -> bool:
    marker = payload.get('pwd')
    return isinstance(marker, str) and hmac.compare_digest(
        marker,
        _password_marker(hashed_password),
    )


# Kept for readability at the reset call site; same check.
password_reset_token_matches_password = token_matches_password


def _decode_token(token: str, expected_purpose: str) -> DecodedToken:
    try:
        payload = cast(
            DecodedToken,
            jwt.decode(
                token,
                SECRET_KEY,
                algorithms=[ALGORITHM],
                options={'require': ['exp', 'sub']},
            ),
        )
    except PyJWTError as exc:
        raise TokenError(str(exc)) from exc

    if payload.get('purpose') != expected_purpose:
        raise TokenError('Invalid token purpose')

    return payload


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_refresh_token(raw_token: str) -> str:
    return sha256(raw_token.encode()).hexdigest()
