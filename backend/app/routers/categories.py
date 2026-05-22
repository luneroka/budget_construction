from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.repositories import category as category_repository
from app.schemas.category import CategoryRead

router = APIRouter(prefix='/categories', tags=['Categories'])


# API ENDPOINT TO GET ALL CATEGORIES
@router.get('/', response_model=list[CategoryRead], status_code=status.HTTP_200_OK)
async def get_categories(db: AsyncSession = Depends(get_db_session)):
    return await category_repository.get_categories(db)


# API ENDPOINT TO GET A CATEGORY BY ID
@router.get(
    '/{category_id}', response_model=CategoryRead, status_code=status.HTTP_200_OK
)
async def get_category(category_id: int, db: AsyncSession = Depends(get_db_session)):
    category = await category_repository.get_category_by_id(db, category_id)

    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Category not found'
        )

    return category
