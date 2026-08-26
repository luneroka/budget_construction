from fastapi import (
    APIRouter,
    BackgroundTasks,
    Cookie,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import (
    FORGOT_PASSWORD_LIMIT,
    LOGIN_LIMIT,
    REFRESH_LIMIT,
    RESET_PASSWORD_LIMIT,
    limiter,
    login_failures,
    normalize_email_key,
    password_reset_requests,
)
from app.core.security import REFRESH_TOKEN_EXPIRE_DAYS, create_access_token
from app.db.session import get_db_session
from app.errors import raise_api_error
from app.schemas.auth import Token, ForgotPasswordRequest, ResetPasswordRequest
from fastapi.security import OAuth2PasswordRequestForm
from app.services import auth as auth_service
from app.services import mailer as mailer_service
from app.core.settings import settings

router = APIRouter(prefix='/auth', tags=['Auth'])

REFRESH_COOKIE_NAME = 'refresh_token'
REFRESH_COOKIE_MAX_AGE = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_token,
        max_age=REFRESH_COOKIE_MAX_AGE,
        httponly=True,
        secure=settings.app_environment == 'production',
        samesite='lax',
        path='/',
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path='/')


# There is deliberately no public registration endpoint: accounts are created
# by an administrator (POST /admin/users), which emails the new user a
# password-reset link so they choose their own password.


@router.post('/login', response_model=Token)
@limiter.limit(LOGIN_LIMIT)
async def login(
    request: Request,
    response: Response,
    credentials: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db_session),
):
    # Per-account lockout on top of the per-IP limit, checked before the
    # (deliberately slow) password hash is computed.
    account_key = normalize_email_key(credentials.username)
    if login_failures.is_limited(account_key):
        raise_api_error(status.HTTP_429_TOO_MANY_REQUESTS, 'rate_limited')

    user = await auth_service.authenticate_user(
        db=db, email=credentials.username, password=credentials.password
    )

    if user is None:
        login_failures.record(account_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid email or password'
        )

    access_token = create_access_token(subject=str(user.id))
    refresh_token = await auth_service.issue_refresh_token(db, user.id)
    _set_refresh_cookie(response, refresh_token)

    return Token(access_token=access_token)


@router.post('/refresh', response_model=Token)
@limiter.limit(REFRESH_LIMIT)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
    refresh_token: str | None = Cookie(default=None),
):
    if refresh_token is None:
        raise_api_error(status.HTTP_401_UNAUTHORIZED, 'not_authenticated')

    try:
        new_refresh_token, user_id = await auth_service.rotate_refresh_token(
            db, refresh_token
        )
    except (ValueError, auth_service.RefreshTokenReuseError):
        _clear_refresh_cookie(response)
        raise_api_error(status.HTTP_401_UNAUTHORIZED, 'not_authenticated')

    access_token = create_access_token(subject=str(user_id))
    _set_refresh_cookie(response, new_refresh_token)

    return Token(access_token=access_token)


@router.post('/logout', status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db_session),
    refresh_token: str | None = Cookie(default=None),
):
    if refresh_token is not None:
        await auth_service.revoke_refresh_token(db, refresh_token)

    _clear_refresh_cookie(response)


@router.post('/forgot-password')
@limiter.limit(FORGOT_PASSWORD_LIMIT)
async def forgot_password(
    request: Request,
    response: Response,
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
):
    generic_response = {'message': 'If this email exists, a reset link has been sent.'}

    # Per-address cap on reset emails, counted whether or not the account
    # exists so the response never reveals which it is.
    email_key = normalize_email_key(payload.email)
    if password_reset_requests.is_limited(email_key):
        return generic_response
    password_reset_requests.record(email_key)

    token = await auth_service.generate_password_reset_token(db=db, email=payload.email)

    # Always return a generic message so we don't disclose whether the email exists.
    if token:
        # Send email in background; we don't await the result here.
        background_tasks.add_task(
            mailer_service.send_reset_password_email,
            payload.email,
            auth_service.build_password_reset_link(token),
        )

    return generic_response


@router.post('/reset-password')
@limiter.limit(RESET_PASSWORD_LIMIT)
async def reset_password(
    request: Request,
    response: Response,
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
