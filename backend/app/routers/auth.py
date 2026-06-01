from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.session import get_db_session
from app.schemas.auth import Token, ForgotPasswordRequest, ResetPasswordRequest
from fastapi.security import OAuth2PasswordRequestForm
from app.schemas.user import UserCreate, UserRead
from app.services import auth as auth_service
from app.services import mailer as mailer_service
from app.core.settings import settings

router = APIRouter(prefix='/auth', tags=['Auth'])


@router.post('/register', response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db_session)):
    user = await auth_service.register_user(db, user_data)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail='Email already exists'
        )

    return user


@router.post('/login', response_model=Token)
async def login(
    credentials: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db_session),
):
    user = await auth_service.authenticate_user(
        db=db, email=credentials.username, password=credentials.password
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid email or password'
        )

    access_token = create_access_token(subject=str(user.id))

    return Token(access_token=access_token)


@router.post('/forgot-password')
async def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
):
    token = await auth_service.generate_password_reset_token(db=db, email=payload.email)

    # Always return a generic message so we don't disclose whether the email exists.
    if token:
        app_url = settings.app_url or ''
        reset_link = (
            f'{app_url}/auth/reset-password?token={token}'
            if app_url
            else f'/auth/reset-password?token={token}'
        )

        # Send email in background; we don't await the result here.
        background_tasks.add_task(
            mailer_service.send_reset_password_email, payload.email, reset_link
        )

    return {'message': 'If this email exists, a reset link has been sent.'}


@router.post('/reset-password')
async def reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db_session),
):
    ok = await auth_service.reset_password(
        db=db, token=payload.token, new_password=payload.new_password
    )

    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid or expired token'
        )

    return {'message': 'Password has been reset successfully.'}
