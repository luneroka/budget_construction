from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.services.export import (
    AccountingExportFilters,
    ExportTransactionType,
    generate_accounting_csv,
)

router = APIRouter(prefix='/projects/{project_id}/exports', tags=['Exports'])


@router.get('/accounting.csv')
async def export_project_accounting_csv(
    project_id: int,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    transaction_type: ExportTransactionType = Query(default=ExportTransactionType.all),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    if start_date is not None and end_date is not None and end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='end_date must be greater than or equal to start_date',
        )

    export = await generate_accounting_csv(
        db,
        project_id,
        current_user.id,
        AccountingExportFilters(
            start_date=start_date,
            end_date=end_date,
            transaction_type=transaction_type,
        ),
    )
    if export is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Project not found',
        )

    return Response(
        content=export.csv_content,
        media_type='text/csv; charset=utf-8',
        headers={
            'Content-Disposition': (
                f'attachment; filename="project-{project_id}-accounting.csv"'
            )
        },
    )
