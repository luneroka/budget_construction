from datetime import datetime, UTC

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refresh_token import RefreshToken


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def create_refresh_token(
    db: AsyncSession,
    *,
    user_id: int,
    token_hash: str,
    family_id: str,
    expires_at: datetime,
) -> RefreshToken:
    refresh_token = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        family_id=family_id,
        expires_at=expires_at,
    )

    db.add(refresh_token)
    await db.commit()
    await db.refresh(refresh_token)

    return refresh_token


async def get_refresh_token_by_hash(
    db: AsyncSession, token_hash: str
) -> RefreshToken | None:
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    return result.scalar_one_or_none()


async def revoke_refresh_token(
    db: AsyncSession, refresh_token: RefreshToken, *, reason: str
) -> None:
    refresh_token.revoked_at = _now()
    refresh_token.revoked_reason = reason
    await db.commit()


async def claim_for_rotation(db: AsyncSession, refresh_token: RefreshToken) -> bool:
    """Atomically mark a not-yet-revoked token as revoked, reason='rotated'.

    Returns True if this call performed the revocation, False if a
    concurrent request already revoked it first (the race is resolved by
    the database, not by a read-then-write check in Python).
    """
    result = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.id == refresh_token.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now(), revoked_reason='rotated')
        .returning(RefreshToken.id)
    )
    await db.commit()
    return result.first() is not None


async def revoke_family(db: AsyncSession, family_id: str, *, reason: str) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now(), revoked_reason=reason)
    )
    await db.commit()


async def revoke_all_for_user(db: AsyncSession, user_id: int, *, reason: str) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now(), revoked_reason=reason)
    )
    await db.commit()
