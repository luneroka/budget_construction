import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password
from app.core.security_log import security_event
from app.dependencies.auth import get_current_user
from app.errors import raise_api_error
from app.models.user import User
from app.db.session import get_db_session
from app.repositories import refresh_token as refresh_token_repository
from app.repositories import user as user_repository
from app.routers._helpers import require_found
from app.routers.integrity import raise_integrity_conflict
from app.schemas.user import UserProfileUpdate, UserRead
from app.services import mailer as mailer_service
from app.services import user_lifecycle

router = APIRouter(prefix='/users', tags=['Users'])


# API ENDPOINT TO GET USER /ME
@router.get('/me', response_model=UserRead)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# API ENDPOINT TO UPDATE CURRENT USER PROFILE
@router.patch('/me', response_model=UserRead)
async def update_me(
    request: Request,
    user_data: UserProfileUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    update_data = user_data.model_dump(
        exclude_unset=True, exclude={'current_password'}
    )

    new_email = update_data.get('email')
    previous_email = current_user.email
    email_changes = (
        isinstance(new_email, str) and new_email.lower() != previous_email.lower()
    )

    if email_changes:
        # Changing the login identifier is an account-takeover primitive, so
        # it needs the password even though the caller already holds a token.
        if not user_data.current_password:
            raise_api_error(
                status.HTTP_400_BAD_REQUEST, 'current_password_required'
            )
        if not verify_password(
            user_data.current_password, current_user.hashed_password
        ):
            security_event(
                'email_change_wrong_password', request=request,
                user_id=current_user.id, level=logging.WARNING,
            )
            raise_api_error(status.HTTP_403_FORBIDDEN, 'current_password_invalid')

    try:
        user = await user_repository.update_user(db, current_user.id, update_data)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    user = require_found(user, 'user_not_found')

    if email_changes:
        # Other sessions (and this one's refresh cookie) are cut off; the
        # old address is told so a hijack can't go unnoticed.
        await refresh_token_repository.revoke_all_for_user(
            db, user.id, reason='email_changed'
        )
        background_tasks.add_task(
            mailer_service.send_email_changed_notice, previous_email, user.email
        )
        security_event(
            'email_changed', request=request, user_id=user.id,
            previous_email=previous_email, new_email=user.email,
        )

    return user


# API ENDPOINT TO SOFT DELETE A USER
@router.delete('/me', response_model=UserRead)
async def soft_delete_user(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    security_event('self_delete', request=request, user_id=current_user.id)
    try:
        user = await user_lifecycle.soft_delete_user(db, current_user.id)
    except user_lifecycle.UserLifecycleError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        ) from error

    user = require_found(user, 'user_not_found')

    return user
