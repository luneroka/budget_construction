from datetime import datetime, timedelta, UTC
from typing import TypeVar, cast

from jose import jwt
from passlib.context import CryptContext

from app.core.settings import settings

T = TypeVar('T')
JWTPayload = dict[str, str | datetime]
DecodedToken = dict[str, object]


def _require_setting(name: str, value: T | None) -> T:
    if value is None:
        raise ValueError(f'{name} must be set')
    return value


SECRET_KEY = _require_setting('SECRET_KEY', settings.secret_key)
ALGORITHM = _require_setting('ALGORITHM', settings.algorithm)
ACCESS_TOKEN_EXPIRE_MINUTES = _require_setting(
    'ACCESS_TOKEN_EXPIRE_MINUTES',
    settings.access_token_expire_minutes,
)

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    payload: JWTPayload = {'sub': subject, 'exp': expire}

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> DecodedToken:
    return cast(DecodedToken, jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM]))
