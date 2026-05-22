from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.repositories import catalog as catalog_repository
from app.schemas.catalog import CatalogCategoryRead

router = APIRouter(prefix='/catalog', tags=['Catalog'])


@router.get(
    '/tree',
    response_model=list[CatalogCategoryRead],
    status_code=status.HTTP_200_OK,
)
async def get_catalog_tree(db: AsyncSession = Depends(get_db_session)):
    return await catalog_repository.get_catalog_tree(db)
