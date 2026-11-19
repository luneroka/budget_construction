from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_admin_user, get_current_user
from app.models.user import User
from app.repositories import lot as lot_repository
from app.routers._helpers import require_found
from app.routers.integrity import raise_integrity_conflict
from app.schemas.lot import (
    GlobalLotCreate,
    GlobalLotMove,
    GlobalLotRead,
    GlobalLotUpdate,
    LotCreate,
    LotVisibilityUpdate,
    ProjectLotRead,
    SupplierLotCreate,
    SupplierLotRead,
)

project_lot_router = APIRouter(prefix='/projects/{project_id}/lots', tags=['Lots'])
supplier_lot_router = APIRouter(
    prefix='/projects/{project_id}/supplier-lots', tags=['Lots']
)
admin_lot_router = APIRouter(
    prefix='/admin/lots',
    tags=['Admin Lots'],
    dependencies=[Depends(get_current_admin_user)],
)


# --- Lots of a project -----------------------------------------------------


@project_lot_router.get('/', response_model=list[ProjectLotRead])
async def get_project_lots(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    """Every global lot and project lot, hidden ones included (`is_hidden`)."""
    return require_found(
        await lot_repository.get_project_lots(db, project_id, current_user.id),
        'project_not_found',
    )


@project_lot_router.post(
    '/', response_model=ProjectLotRead, status_code=status.HTTP_201_CREATED
)
async def create_project_lot(
    project_id: int,
    lot_data: LotCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        lot = await lot_repository.create_project_lot(
            db, project_id, current_user.id, lot_data
        )
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    return require_found(lot, 'project_not_found')


@project_lot_router.patch('/{lot_id}', response_model=ProjectLotRead)
async def update_project_lot_visibility(
    project_id: int,
    lot_id: int,
    visibility: LotVisibilityUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    """Hide or unhide a lot in the project. Lots are never renamed here."""
    return require_found(
        await lot_repository.set_lot_visibility(
            db,
            project_id,
            current_user.id,
            lot_id,
            is_hidden=visibility.is_hidden,
        ),
        'project_not_found',
    )


# --- Supplier <-> lot assignments ------------------------------------------


@supplier_lot_router.get('/', response_model=list[SupplierLotRead])
async def get_supplier_lots(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return require_found(
        await lot_repository.get_supplier_lots(db, project_id, current_user.id),
        'project_not_found',
    )


@supplier_lot_router.post(
    '/', response_model=SupplierLotRead, status_code=status.HTTP_201_CREATED
)
async def assign_supplier_lot(
    project_id: int,
    assignment: SupplierLotCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return require_found(
        await lot_repository.assign_supplier_lot(
            db,
            project_id,
            current_user.id,
            assignment.supplier_id,
            assignment.lot_id,
        ),
        'project_not_found',
    )


@supplier_lot_router.delete(
    '/{supplier_id}/{lot_id}', status_code=status.HTTP_204_NO_CONTENT
)
async def unassign_supplier_lot(
    project_id: int,
    supplier_id: int,
    lot_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    require_found(
        await lot_repository.unassign_supplier_lot(
            db, project_id, current_user.id, supplier_id, lot_id
        ),
        'project_not_found',
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Global lots (admin only) ----------------------------------------------


@admin_lot_router.get('/', response_model=list[GlobalLotRead])
async def get_global_lots(db: AsyncSession = Depends(get_db_session)):
    return await lot_repository.get_global_lots(db)


@admin_lot_router.post(
    '/', response_model=GlobalLotRead, status_code=status.HTTP_201_CREATED
)
async def create_global_lot(
    lot_data: GlobalLotCreate,
    db: AsyncSession = Depends(get_db_session),
):
    try:
        return await lot_repository.create_global_lot(db, lot_data)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)


@admin_lot_router.delete('/{lot_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_global_lot(
    lot_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    """Refused while any transaction, active or in a trash, uses the lot."""
    require_found(
        await lot_repository.delete_global_lot(db, lot_id),
        'lot_not_found',
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@admin_lot_router.patch('/{lot_id}', response_model=GlobalLotRead)
async def update_global_lot(
    lot_id: int,
    lot_data: GlobalLotUpdate,
    db: AsyncSession = Depends(get_db_session),
):
    try:
        lot = await lot_repository.update_global_lot(db, lot_id, lot_data)
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    return require_found(lot, 'lot_not_found')


@admin_lot_router.post('/{lot_id}/move', response_model=list[GlobalLotRead])
async def move_global_lot(
    lot_id: int,
    move: GlobalLotMove,
    db: AsyncSession = Depends(get_db_session),
):
    return require_found(
        await lot_repository.move_global_lot(db, lot_id, move.direction),
        'lot_not_found',
    )
