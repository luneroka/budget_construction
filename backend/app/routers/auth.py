from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.session import get_db_session
from app.schemas.auth import Token
from fastapi.security import OAuth2PasswordRequestForm
from app.schemas.user import UserCreate, UserRead
from app.services import auth as auth_service

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
