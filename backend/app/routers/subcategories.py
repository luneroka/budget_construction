from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.repositories import subcategory as subcategory_repository
from app.schemas.subcategory import SubcategoryRead

router = APIRouter(prefix='/subcategories', tags=['Subcategories'])


# API ENDPOINT TO GET ALL SUBCATEGORIES
@router.get('/', response_model=list[SubcategoryRead], status_code=status.HTTP_200_OK)
async def get_subcategories(db: AsyncSession = Depends(get_db_session)):
    return await subcategory_repository.get_subcategories(db)


# API ENDPOINT TO GET ALL SUBCATEGORIES FOR A SPECIFIC CATEGORY_ID
@router.get(
    '/by-category/{category_id}',
    response_model=list[SubcategoryRead],
    status_code=status.HTTP_200_OK,
)
async def get_subcategories_by_category_id(
    category_id: int, db: AsyncSession = Depends(get_db_session)
):
    return await subcategory_repository.get_subcategories_by_category_id(
        db, category_id
    )


# API ENDPOINT TO GET A SUBCATEGORY BY ID
@router.get(
    '/{subcategory_id}', response_model=SubcategoryRead, status_code=status.HTTP_200_OK
)
async def get_subcategory(
    subcategory_id: int, db: AsyncSession = Depends(get_db_session)
):
    subcategory = await subcategory_repository.get_subcategory_by_id(db, subcategory_id)

    if subcategory is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Subcategory not found'
        )

    return subcategory
