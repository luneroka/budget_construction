"""Global lots, project lots, their visibility per project, and the
supplier <-> lot assignments of a project.

A lot is *available* in a project when it is global or belongs to that
project, and is not hidden there. Only available lots take transactions,
appear in pickers and count in the project's totals.
"""

from __future__ import annotations

from fastapi import status
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.errors import DomainError
from app.models.lot import Lot, ProjectHiddenLot, SupplierLot
from app.models.supplier import Supplier
from app.models.transaction import Transaction
from app.repositories.common import get_active_project
from app.schemas.lot import (
    GlobalLotUpdate,
    LotCreate,
    LotMoveDirection,
    ProjectLotRead,
)


def lot_in_project(project_id: int) -> ColumnElement[bool]:
    """Global lots and the project's own lots."""
    return or_(Lot.project_id.is_(None), Lot.project_id == project_id)


def lot_hidden_in_project(project_id: int) -> ColumnElement[bool]:
    return (
        select(ProjectHiddenLot.lot_id)
        .where(
            ProjectHiddenLot.project_id == project_id,
            ProjectHiddenLot.lot_id == Lot.id,
        )
        .exists()
    )


def lot_display_order() -> tuple[ColumnElement[object], ...]:
    """Global lots first in their admin order, then project lots by code."""
    return (
        Lot.project_id.is_not(None),
        Lot.sort_order,
        Lot.code,
        Lot.id,
    )


async def get_visible_lots(db: AsyncSession, project_id: int) -> list[Lot]:
    """The lots available in the project, in display order. The caller has
    already checked that the project belongs to the user."""
    result = await db.execute(
        select(Lot)
        .where(lot_in_project(project_id), ~lot_hidden_in_project(project_id))
        .order_by(*lot_display_order())
    )
    return list(result.scalars().all())


async def get_available_lot(
    db: AsyncSession, project_id: int, lot_id: int
) -> Lot | None:
    result = await db.execute(
        select(Lot).where(
            Lot.id == lot_id,
            lot_in_project(project_id),
            ~lot_hidden_in_project(project_id),
        )
    )
    return result.scalar_one_or_none()


async def require_available_lot(
    db: AsyncSession, project_id: int, lot_id: int
) -> Lot:
    lot = await get_available_lot(db, project_id, lot_id)
    if lot is None:
        raise DomainError(status.HTTP_400_BAD_REQUEST, 'lot_not_available')
    return lot


async def _get_project_or_global_lot(
    db: AsyncSession, project_id: int, lot_id: int
) -> Lot | None:
    result = await db.execute(
        select(Lot).where(Lot.id == lot_id, lot_in_project(project_id))
    )
    return result.scalar_one_or_none()


async def _active_transaction_count(
    db: AsyncSession,
    project_id: int,
    lot_id: int,
    *,
    supplier_id: int | None = None,
) -> int:
    query = select(func.count(Transaction.id)).where(
        Transaction.project_id == project_id,
        Transaction.lot_id == lot_id,
        Transaction.deleted_at.is_(None),
    )
    if supplier_id is not None:
        query = query.where(Transaction.supplier_id == supplier_id)
    result = await db.execute(query)
    return int(result.scalar_one())


async def get_project_lots(
    db: AsyncSession, project_id: int, user_id: int
) -> list[ProjectLotRead] | None:
    """Every lot of the project, hidden ones included, with its visibility."""
    if await get_active_project(db, project_id, user_id) is None:
        return None

    hidden = lot_hidden_in_project(project_id).label('is_hidden')
    active_count = (
        select(func.count(Transaction.id))
        .where(
            Transaction.project_id == project_id,
            Transaction.lot_id == Lot.id,
            Transaction.deleted_at.is_(None),
        )
        .scalar_subquery()
        .label('active_transaction_count')
    )
    result = await db.execute(
        select(Lot, hidden, active_count)
        .where(lot_in_project(project_id))
        .order_by(*lot_display_order())
    )
    return [
        ProjectLotRead(
            id=lot.id,
            project_id=lot.project_id,
            code=lot.code,
            designation=lot.designation,
            is_global=lot.is_global,
            is_hidden=bool(is_hidden),
            active_transaction_count=int(count),
        )
        for lot, is_hidden, count in result.all()
    ]


async def _project_lot_read(
    db: AsyncSession, project_id: int, user_id: int, lot_id: int
) -> ProjectLotRead:
    lots = await get_project_lots(db, project_id, user_id)
    assert lots is not None
    return next(lot for lot in lots if lot.id == lot_id)


async def create_project_lot(
    db: AsyncSession, project_id: int, user_id: int, lot_data: LotCreate
) -> ProjectLotRead | None:
    if await get_active_project(db, project_id, user_id) is None:
        return None

    # At creation, a project lot's code differs from every global code and
    # from the project's other lots. A later admin re-code of a global lot
    # is not checked against project lots (spec criterion 2).
    conflict = await db.execute(
        select(Lot.id).where(lot_in_project(project_id), Lot.code == lot_data.code)
    )
    if conflict.first() is not None:
        raise DomainError(status.HTTP_409_CONFLICT, 'lot_code_conflict')

    lot = Lot(
        project_id=project_id,
        code=lot_data.code,
        designation=lot_data.designation,
    )
    db.add(lot)
    await db.commit()

    return await _project_lot_read(db, project_id, user_id, lot.id)


async def set_lot_visibility(
    db: AsyncSession,
    project_id: int,
    user_id: int,
    lot_id: int,
    *,
    is_hidden: bool,
) -> ProjectLotRead | None:
    if await get_active_project(db, project_id, user_id) is None:
        return None
    if await _get_project_or_global_lot(db, project_id, lot_id) is None:
        raise DomainError(status.HTTP_404_NOT_FOUND, 'lot_not_found')

    if is_hidden:
        # Soft-deleted transactions do not block hiding; restoring one
        # unhides the lot (trash repository).
        if await _active_transaction_count(db, project_id, lot_id) > 0:
            raise DomainError(status.HTTP_409_CONFLICT, 'lot_has_active_transactions')
        await db.execute(
            insert(ProjectHiddenLot)
            .values(project_id=project_id, lot_id=lot_id)
            .on_conflict_do_nothing()
        )
    else:
        await unhide_lot(db, project_id, lot_id)
    await db.commit()

    return await _project_lot_read(db, project_id, user_id, lot_id)


async def unhide_lot(db: AsyncSession, project_id: int, lot_id: int) -> None:
    """Make the lot visible in the project. The caller commits."""
    await db.execute(
        delete(ProjectHiddenLot).where(
            ProjectHiddenLot.project_id == project_id,
            ProjectHiddenLot.lot_id == lot_id,
        )
    )


# --- Global lots (admin) ---------------------------------------------------


async def get_global_lots(db: AsyncSession) -> list[Lot]:
    result = await db.execute(
        select(Lot)
        .where(Lot.project_id.is_(None))
        .order_by(Lot.sort_order, Lot.code, Lot.id)
    )
    return list(result.scalars().all())


async def _get_global_lot(db: AsyncSession, lot_id: int) -> Lot | None:
    result = await db.execute(
        select(Lot).where(Lot.id == lot_id, Lot.project_id.is_(None))
    )
    return result.scalar_one_or_none()


async def update_global_lot(
    db: AsyncSession, lot_id: int, lot_data: GlobalLotUpdate
) -> Lot | None:
    lot = await _get_global_lot(db, lot_id)
    if lot is None:
        return None

    values = lot_data.model_dump(exclude_unset=True, exclude_none=True)
    others = and_(Lot.project_id.is_(None), Lot.id != lot_id)
    if 'code' in values:
        conflict = await db.execute(
            select(Lot.id).where(others, Lot.code == values['code'])
        )
        if conflict.first() is not None:
            raise DomainError(status.HTTP_409_CONFLICT, 'lot_code_conflict')
    if 'designation' in values:
        conflict = await db.execute(
            select(Lot.id).where(others, Lot.designation == values['designation'])
        )
        if conflict.first() is not None:
            raise DomainError(status.HTTP_409_CONFLICT, 'lot_designation_conflict')

    for field, value in values.items():
        setattr(lot, field, value)
    await db.commit()
    await db.refresh(lot)
    return lot


async def move_global_lot(
    db: AsyncSession, lot_id: int, direction: LotMoveDirection
) -> list[Lot] | None:
    """Swap the lot with its neighbour and return the new global order.

    Moving the first lot up or the last one down changes nothing.
    """
    lots = await get_global_lots(db)
    index = next((i for i, lot in enumerate(lots) if lot.id == lot_id), None)
    if index is None:
        return None

    target = index - 1 if direction == LotMoveDirection.up else index + 1
    if 0 <= target < len(lots):
        lots[index], lots[target] = lots[target], lots[index]
    # Renumber from 0 so the order stays dense whatever it was before.
    for position, lot in enumerate(lots):
        lot.sort_order = position
    await db.commit()

    return await get_global_lots(db)


# --- Supplier <-> lot assignments ------------------------------------------


async def ensure_supplier_lot(
    db: AsyncSession, project_id: int, supplier_id: int | None, lot_id: int
) -> None:
    """Assign the supplier to the lot in the project if it is not yet. The
    caller commits."""
    if supplier_id is None:
        return
    await db.execute(
        insert(SupplierLot)
        .values(project_id=project_id, supplier_id=supplier_id, lot_id=lot_id)
        .on_conflict_do_nothing()
    )


async def get_supplier_lots(
    db: AsyncSession, project_id: int, user_id: int
) -> list[SupplierLot] | None:
    if await get_active_project(db, project_id, user_id) is None:
        return None

    result = await db.execute(
        select(SupplierLot)
        .join(Supplier, SupplierLot.supplier_id == Supplier.id)
        .join(Lot, SupplierLot.lot_id == Lot.id)
        .where(
            SupplierLot.project_id == project_id,
            Supplier.user_id == user_id,
            Supplier.deleted_at.is_(None),
            ~lot_hidden_in_project(project_id),
        )
        .order_by(SupplierLot.lot_id, SupplierLot.supplier_id)
    )
    return list(result.scalars().all())


async def _require_active_supplier(
    db: AsyncSession, supplier_id: int, user_id: int
) -> None:
    result = await db.execute(
        select(Supplier.id).where(
            Supplier.id == supplier_id,
            Supplier.user_id == user_id,
            Supplier.deleted_at.is_(None),
        )
    )
    if result.scalar_one_or_none() is None:
        raise DomainError(status.HTTP_400_BAD_REQUEST, 'supplier_not_found_or_inactive')


async def assign_supplier_lot(
    db: AsyncSession,
    project_id: int,
    user_id: int,
    supplier_id: int,
    lot_id: int,
) -> SupplierLot | None:
    if await get_active_project(db, project_id, user_id) is None:
        return None
    await _require_active_supplier(db, supplier_id, user_id)
    await require_available_lot(db, project_id, lot_id)

    await ensure_supplier_lot(db, project_id, supplier_id, lot_id)
    await db.commit()

    result = await db.execute(
        select(SupplierLot).where(
            SupplierLot.project_id == project_id,
            SupplierLot.supplier_id == supplier_id,
            SupplierLot.lot_id == lot_id,
        )
    )
    return result.scalar_one()


async def unassign_supplier_lot(
    db: AsyncSession,
    project_id: int,
    user_id: int,
    supplier_id: int,
    lot_id: int,
) -> bool | None:
    """None when the project is not visible; raises when the assignment does
    not exist or the supplier still has active transactions in the lot."""
    if await get_active_project(db, project_id, user_id) is None:
        return None

    result = await db.execute(
        select(SupplierLot)
        .join(Supplier, SupplierLot.supplier_id == Supplier.id)
        .where(
            SupplierLot.project_id == project_id,
            SupplierLot.supplier_id == supplier_id,
            SupplierLot.lot_id == lot_id,
            Supplier.user_id == user_id,
        )
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise DomainError(status.HTTP_404_NOT_FOUND, 'supplier_lot_not_found')

    if (
        await _active_transaction_count(
            db, project_id, lot_id, supplier_id=supplier_id
        )
        > 0
    ):
        raise DomainError(
            status.HTTP_409_CONFLICT, 'supplier_lot_has_active_transactions'
        )

    await db.delete(assignment)
    await db.commit()
    return True


async def plan_supplier_project_lots(
    db: AsyncSession,
    project_id: int,
    user_id: int,
    supplier_id: int | None,
    lot_ids: list[int],
) -> tuple[set[int], set[int]]:
    """Check the supplier form's « Lots du projet » before anything is written,
    and return the lots to assign and to unassign.

    ``supplier_id`` is None for a supplier being created. Only the project's
    visible lots can be ticked, and only they are unassigned when left out:
    an assignment in a hidden lot is never removed here. A lot where the
    supplier still has active transactions cannot be unticked.
    """
    if await get_active_project(db, project_id, user_id) is None:
        raise DomainError(status.HTTP_404_NOT_FOUND, 'project_not_found')

    visible = {lot.id for lot in await get_visible_lots(db, project_id)}
    wanted = set(lot_ids)
    if not wanted <= visible:
        raise DomainError(status.HTTP_400_BAD_REQUEST, 'lot_not_available')

    current: set[int] = set()
    if supplier_id is not None:
        result = await db.execute(
            select(SupplierLot.lot_id).where(
                SupplierLot.project_id == project_id,
                SupplierLot.supplier_id == supplier_id,
            )
        )
        current = set(result.scalars().all())

    to_remove = (current & visible) - wanted
    for lot_id in sorted(to_remove):
        if (
            await _active_transaction_count(
                db, project_id, lot_id, supplier_id=supplier_id
            )
            > 0
        ):
            raise DomainError(
                status.HTTP_409_CONFLICT, 'supplier_lot_has_active_transactions'
            )

    return wanted - current, to_remove


async def apply_supplier_project_lots(
    db: AsyncSession,
    project_id: int,
    supplier_id: int,
    to_add: set[int],
    to_remove: set[int],
) -> None:
    """Write what ``plan_supplier_project_lots`` returned. The caller commits."""
    for lot_id in sorted(to_add):
        await ensure_supplier_lot(db, project_id, supplier_id, lot_id)
    if to_remove:
        await db.execute(
            delete(SupplierLot).where(
                SupplierLot.project_id == project_id,
                SupplierLot.supplier_id == supplier_id,
                SupplierLot.lot_id.in_(to_remove),
            )
        )
