from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories import supplier as supplier_repository
from app.schemas.supplier import SupplierCreate, SupplierRead

router = APIRouter(prefix='/suppliers', tags=['Suppliers'])


# API ENDPOINT TO ADD NEW SUPPLIER
@router.post('/', response_model=SupplierRead, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    supplier_data: SupplierCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return await supplier_repository.create_supplier(db, supplier_data, current_user.id)


# API ENDPOINT TO GET ALL SUPPLIERS
@router.get('/', response_model=list[SupplierRead])
async def get_suppliers(
    include_deleted: bool = False,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return await supplier_repository.get_suppliers(db, current_user.id, include_deleted)


# API ENDPOINT TO GET A SUPPLIER BY ID
@router.get('/{supplier_id}', response_model=SupplierRead)
async def get_supplier(
    supplier_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    supplier = await supplier_repository.get_supplier_by_id(
        db, supplier_id, current_user.id
    )

    if supplier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Supplier not found',
        )

    return supplier


# API ENDPOINT TO SOFT DELETE A SUPPLIER
@router.delete('/{supplier_id}', response_model=SupplierRead)
async def delete_supplier(
    supplier_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    supplier = await supplier_repository.soft_delete_supplier(
        db, supplier_id, current_user.id
    )

    if supplier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Supplier not found'
        )

    return supplier
