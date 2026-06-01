from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.repositories import product as product_repository
from app.schemas.product import ProductWithHierarchy

router = APIRouter(prefix='/products', tags=['Products'])


# API ENDPOINT TO GET ALL PRODUCTS
@router.get(
    '/', response_model=list[ProductWithHierarchy], status_code=status.HTTP_200_OK
)
async def get_products(db: AsyncSession = Depends(get_db_session)):
    return await product_repository.get_products(db)


@router.get(
    '/with-hierarchy',
    response_model=list[ProductWithHierarchy],
    status_code=status.HTTP_200_OK,
)
async def get_products_with_hierarchy(
    db: AsyncSession = Depends(get_db_session),
):
    return await product_repository.get_products_with_hierarchy(db)


# API ENDPOINT TO GET ALL PRODUCTS FOR A SPECIFIC SUBCATEGORY_ID
@router.get(
    '/by-subcategory/{subcategory_id}',
    response_model=list[ProductWithHierarchy],
    status_code=status.HTTP_200_OK,
)
async def get_products_by_subcategory_id(
    subcategory_id: int, db: AsyncSession = Depends(get_db_session)
):
    return await product_repository.get_products_by_subcategory_id(db, subcategory_id)


# API ENDPOINT TO GET A PRODUCT BY ID
@router.get(
    '/{product_id}',
    response_model=ProductWithHierarchy,
    status_code=status.HTTP_200_OK,
)
async def get_product(product_id: int, db: AsyncSession = Depends(get_db_session)):
    product = await product_repository.get_product_by_id(db, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='product not found'
        )

    return product
