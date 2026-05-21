from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.repositories import user as user_repository
from app.schemas.user import UserRead

router = APIRouter(prefix='/users', tags=['Users'])


# API ENDPOINT TO GET USER /ME


# API ENDPOINT TO GET USER BY ID
@router.get('/{user_id}', response_model=UserRead)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db_session)):
    user = await user_repository.get_user_by_id(db, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='User not found'
        )

    return user
