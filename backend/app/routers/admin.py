from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.db.session import get_db_session
from app.repositories import admin as admin_repository
from app.routers.integrity import raise_integrity_conflict
from app.schemas.user import AdminUserCreate, AdminUserRead, AdminUserUpdate
from app.dependencies.auth import get_current_admin_user
from app.services import auth as auth_service
from app.services import mailer as mailer_service
from app.services import user_lifecycle

router = APIRouter(
    prefix='/admin/users',
    tags=['Admin Users'],
    dependencies=[Depends(get_current_admin_user)],
)


# API ENDPOINT FOR ADMIN TO CREATE A USER (replaces public self-registration)
@router.post('/', response_model=AdminUserRead, status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    user_data: AdminUserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
):
    try:
        user = await auth_service.invite_user(
            db, name=user_data.name, email=user_data.email
        )
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='A user with this email already exists',
        )

    # The account has an unusable random password; the invitee sets their
    # own through the standard reset flow.
    token = await auth_service.generate_password_reset_token(db, email=user.email)
    if token:
        background_tasks.add_task(
            mailer_service.send_reset_password_email,
            user.email,
            auth_service.build_password_reset_link(token),
        )

    return user


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
        await raise_integrity_conflict(db, error)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='User not found'
        )

    return user


# API ENDPOINT FOR ADMIN TO SOFT DELETE A USER
@router.delete('/{user_id}', response_model=AdminUserRead)
async def admin_soft_delete_user(
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


# API ENDPOINT FOR ADMIN TO RESTORE A USER
@router.post('/{user_id}/restore', response_model=AdminUserRead)
async def admin_restore_user(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    try:
        user = await user_lifecycle.restore_user(db, user_id)
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


# API ENDPOINT FOR ADMIN TO PERMANENTLY DELETE A USER
@router.delete('/{user_id}/permanent', status_code=status.HTTP_204_NO_CONTENT)
async def admin_hard_delete_user(
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
        deleted = await user_lifecycle.hard_delete_user(db, user_id)
    except user_lifecycle.UserLifecycleError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        ) from error

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='User not found'
        )
