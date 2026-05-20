from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.repositories import supplier as supplier_repository
from app.schemas.supplier import SupplierCreate, SupplierRead

router = APIRouter(
  prefix='/suppliers',
  tags=['Suppliers']
)

@router.post("/", response_model=SupplierRead, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    supplier_data: SupplierCreate,
    db: AsyncSession = Depends(get_db_session),
):
    return await supplier_repository.create_supplier(db, supplier_data)


@router.get('/', response_model=list[SupplierRead])
async def get_suppliers(db: AsyncSession = Depends(get_db_session)):
  return await supplier_repository.get_suppliers(db)


@router.get('/{supplier_id}', response_model=SupplierRead)
async def get_supplier(
  supplier_id: int,
  db: AsyncSession = Depends(get_db_session),
):
  supplier = await supplier_repository.get_supplier_by_id(db, supplier_id)

  if supplier is None:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail='Supplier not found',
    )
  
  return supplier