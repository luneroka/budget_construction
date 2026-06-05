from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import get_current_user
from app.models.user import User
from app.db.session import get_db_session
from app.repositories import user as user_repository
from app.schemas.user import UserProfileUpdate, UserRead
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
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        user = await user_repository.update_user(
            db, current_user.id, user_data.model_dump(exclude_unset=True)
        )
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='A user with this email already exists',
        ) from error

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='User not found'
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
