from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.db.session import get_db_session
from app.repositories import admin as admin_repository
from app.schemas.user import AdminUserRead, AdminUserUpdate
from app.dependencies.auth import get_current_admin_user
from app.services import user_lifecycle

router = APIRouter(
    prefix='/admin/users',
    tags=['Admin Users'],
    dependencies=[Depends(get_current_admin_user)],
)


# API ENDPOINT FOR ADMIN TO GET USERS
@router.get('/', response_model=list[AdminUserRead])
async def get_users(
    db: AsyncSession = Depends(get_db_session), include_deleted: bool = False
):
    return await admin_repository.get_users(db, include_deleted)


# API ENDPOINT FOR ADMIN TO GET A USER BY ID
@router.get('/{user_id}', response_model=AdminUserRead)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
    include_deleted: bool = False,
):
    user = await admin_repository.get_user_by_id_for_admin(db, user_id, include_deleted)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='User not found'
        )

    return user


# API ENDPOINT FOR ADMIN TO UPDATE A USER
@router.patch('/{user_id}', response_model=AdminUserRead)
async def admin_update_user(
    user_id: int,
    user_data: AdminUserUpdate,
    db: AsyncSession = Depends(get_db_session),
    admin: User = Depends(get_current_admin_user),
):
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Use self-service endpoint',
        )

    try:
        user = await user_lifecycle.update_user(db, user_id, user_data)
    except user_lifecycle.UserLifecycleError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        ) from error
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


# API ENDPOINT FOR ADMIN TO SOFT DELETE A USER
@router.delete('/{user_id}', response_model=AdminUserRead)
async def admin_delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
    admin: User = Depends(get_current_admin_user),
):
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Use self-delete endpoint',
        )

    try:
        user = await user_lifecycle.soft_delete_user(db, user_id)
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
