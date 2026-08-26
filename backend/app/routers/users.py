from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password
from app.dependencies.auth import get_current_user
from app.errors import raise_api_error
from app.models.user import User
from app.db.session import get_db_session
from app.repositories import refresh_token as refresh_token_repository
from app.repositories import user as user_repository
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
            raise_api_error(status.HTTP_403_FORBIDDEN, 'current_password_invalid')

    try:
        user = await user_repository.update_user(db, current_user.id, update_data)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='User not found'
        )

    if email_changes:
        # Other sessions (and this one's refresh cookie) are cut off; the
        # old address is told so a hijack can't go unnoticed.
        await refresh_token_repository.revoke_all_for_user(
            db, user.id, reason='email_changed'
        )
        background_tasks.add_task(
            mailer_service.send_email_changed_notice, previous_email, user.email
        )

    return user


# API ENDPOINT TO GET USER BY ID
@router.get('/{user_id}', response_model=UserRead)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    if user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='User not found'
        )

    user = await user_repository.get_user_by_id(db, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='User not found'
        )

    return user


# API ENDPOINT TO SOFT DELETE A USER
@router.delete('/me', response_model=UserRead)
async def soft_delete_user(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        user = await user_lifecycle.soft_delete_user(db, current_user.id)
    except user_lifecycle.UserLifecycleError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        ) from error

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='User not found'
        )

    return user
