from datetime import datetime, timedelta, UTC
from typing import Any
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_password_reset_token,
    decode_password_reset_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    password_reset_token_matches_password,
    verify_password,
)
from app.repositories import refresh_token as refresh_token_repository
from app.repositories import user as user_repository
from app.schemas.user import UserCreate
from app.models.user import User


class RefreshTokenReuseError(Exception):
    """Raised when a refresh token that was already rotated out or revoked is
    presented again -- a signal the token may have been stolen."""


# A rotated-out token presented again within this window is treated as a
# concurrent legitimate request (multiple browser tabs, a double-fired
# client-side effect) racing the same rotation, not as theft. Reuse outside
# this window is treated as theft and revokes the whole session family.
REFRESH_TOKEN_REUSE_GRACE_SECONDS = 10


async def register_user(db: AsyncSession, user_data: UserCreate) -> User | None:
    existing_user = await user_repository.get_user_by_email(db, user_data.email)

    if existing_user:
        return None

    hashed_password = hash_password(user_data.password)

    return await user_repository.create_user(
        db=db, user_data=user_data, hashed_password=hashed_password
    )


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    user = await user_repository.get_user_by_email(db, email)

    if user is None:
        return None

    if not user.is_active:
        return None

    if not verify_password(password, user.hashed_password):
        return None

    return user


async def generate_password_reset_token(
    db: AsyncSession, email: str, expires_minutes: int = 15
) -> str | None:
    user = await user_repository.get_user_by_email(db, email)

    if user is None or not user.is_active:
        return None

    # Use user id as subject to avoid exposing email in token
    return create_password_reset_token(
        subject=str(user.id),
        hashed_password=user.hashed_password,
        expires_minutes=expires_minutes,
    )


async def reset_password(db: AsyncSession, token: str, new_password: str) -> bool:
    try:
        payload = decode_password_reset_token(token)
    except Exception:
        return False

    subject: Any = payload.get('sub')

    if not isinstance(subject, str):
        return False

    try:
        user_id = int(subject)
    except (TypeError, ValueError):
        return False

    user = await user_repository.get_user_by_id(db, user_id)

    if user is None or not user.is_active:
        return False

    if not password_reset_token_matches_password(payload, user.hashed_password):
        return False

    hashed = hash_password(new_password)

    await user_repository.update_user_password(db=db, user=user, hashed_password=hashed)
    await refresh_token_repository.revoke_all_for_user(
        db, user.id, reason='password_reset'
    )

    return True


def _refresh_token_expiry() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)


async def _create_refresh_token(
    db: AsyncSession, *, user_id: int, family_id: str
) -> str:
    raw_token = generate_refresh_token()

    await refresh_token_repository.create_refresh_token(
        db,
        user_id=user_id,
        token_hash=hash_refresh_token(raw_token),
        family_id=family_id,
        expires_at=_refresh_token_expiry(),
    )

    return raw_token


async def issue_refresh_token(db: AsyncSession, user_id: int) -> str:
    """Issue a brand-new refresh token (new session family), e.g. on login."""
    family_id = str(uuid.uuid4())
    return await _create_refresh_token(db, user_id=user_id, family_id=family_id)


async def rotate_refresh_token(db: AsyncSession, raw_token: str) -> tuple[str, int]:
    """Validate and rotate a refresh token, sliding its expiry forward.

    Returns (new_raw_token, user_id). Raises ValueError if the token is
    unknown or expired, or RefreshTokenReuseError if it was reused well after
    it was already rotated out -- in which case the whole session family is
    revoked. Concurrent requests presenting the same token at (almost) the
    same time -- multiple tabs, a double-fired client effect -- are not
    treated as theft; see REFRESH_TOKEN_REUSE_GRACE_SECONDS.
    """
    token_hash = hash_refresh_token(raw_token)
    existing = await refresh_token_repository.get_refresh_token_by_hash(db, token_hash)

    if existing is None:
        raise ValueError('Invalid refresh token')

    now = datetime.now(UTC).replace(tzinfo=None)

    won_rotation = False
    if existing.revoked_at is None:
        if existing.expires_at < now:
            raise ValueError('Refresh token expired')
        won_rotation = await refresh_token_repository.claim_for_rotation(db, existing)

    if not won_rotation:
        # If this token was already revoked before we even read it, only a
        # 'rotated' reason is eligible for grace -- an explicit logout or
        # password-reset revocation must never be silently undone. A token
        # that *just* lost the atomic claim above (still None in this
        # in-memory copy) was necessarily beaten by a concurrent rotation.
        revoked_reason = existing.revoked_reason if existing.revoked_at else 'rotated'
        revoked_at = existing.revoked_at or now
        grace_deadline = revoked_at + timedelta(seconds=REFRESH_TOKEN_REUSE_GRACE_SECONDS)

        if revoked_reason != 'rotated' or now > grace_deadline:
            await refresh_token_repository.revoke_family(
                db, existing.family_id, reason='reuse_detected'
            )
            raise RefreshTokenReuseError('Refresh token reuse detected')

    new_raw_token = await _create_refresh_token(
        db, user_id=existing.user_id, family_id=existing.family_id
    )

    return new_raw_token, existing.user_id


async def revoke_refresh_token(db: AsyncSession, raw_token: str) -> None:
    token_hash = hash_refresh_token(raw_token)
    existing = await refresh_token_repository.get_refresh_token_by_hash(db, token_hash)

    if existing is not None and existing.revoked_at is None:
        await refresh_token_repository.revoke_refresh_token(
            db, existing, reason='logout'
        )
