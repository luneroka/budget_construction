from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories import budget_line as budget_line_repository
from app.repositories import project as project_repository
from app.schemas.financial_engine import (
    DashboardCategoryBudgetActualRead,
    DashboardCategoryDistributionRead,
    DashboardFinancialOverviewRead,
    DashboardSpendingOverTimePointRead,
    DashboardSupplierDistributionRead,
    ProjectFinancialSummaryRead,
)
from app.schemas.project import (
    GeneratedProjectRead,
    ProjectCreate,
    ProjectFromTemplateCreate,
    ProjectRead,
    ProjectUpdate,
)
from app.services import generate_project as generate_project_service
from app.services.financial_engine import financial_engine
from app.routers.integrity import raise_integrity_conflict

router = APIRouter(prefix='/projects', tags=['Projects'])


# API ENDPOINT TO ADD NEW PROJECT
@router.post('/', response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        return await project_repository.create_project(
            db, project_data, current_user.id
        )
    except project_repository.ProjectValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)


@router.post(
    '/from-template',
    response_model=GeneratedProjectRead,
    status_code=status.HTTP_201_CREATED,
)
async def generate_project_from_template(
    project_data: ProjectFromTemplateCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        return await generate_project_service.generate_project_from_template(
            db, project_data, current_user.id
        )
    except project_repository.ProjectValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error
    except budget_line_repository.BudgetLineValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)


# API ENDPOINT TO GET ALL PROJECTS
@router.get('/', response_model=list[ProjectRead])
async def get_projects(
    include_deleted: bool = False,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return await project_repository.get_projects(db, current_user.id, include_deleted)


# API ENDPOINT TO GET A PROJECT BY ID
@router.get('/{project_id}', response_model=ProjectRead)
async def get_project(
    project_id: int,
    include_deleted: bool = False,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    project = await project_repository.get_project_by_id(
        db,
        project_id,
        current_user.id,
        include_deleted=include_deleted,
    )

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return project


@router.get(
    '/{project_id}/financial-summary', response_model=ProjectFinancialSummaryRead
)
async def get_project_financial_summary(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    financial_summary = await financial_engine.get_project_summary(
        db,
        project_id,
        current_user.id,
    )

    if financial_summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return financial_summary


@router.get(
    '/{project_id}/dashboard/financial-overview',
    response_model=DashboardFinancialOverviewRead,
)
async def get_project_dashboard_financial_overview(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    financial_overview = await financial_engine.get_dashboard_financial_overview(
        db,
        project_id,
        current_user.id,
    )

    if financial_overview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return financial_overview


@router.get(
    '/{project_id}/dashboard/charts/spending-over-time',
    response_model=list[DashboardSpendingOverTimePointRead],
)
async def get_project_dashboard_spending_over_time(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    projection = await financial_engine.get_dashboard_spending_over_time(
        db,
        project_id,
        current_user.id,
    )

    if projection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return projection


@router.get(
    '/{project_id}/dashboard/charts/budget-vs-actual',
    response_model=list[DashboardCategoryBudgetActualRead],
)
async def get_project_dashboard_budget_vs_actual(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    projection = await financial_engine.get_dashboard_budget_vs_actual(
        db,
        project_id,
        current_user.id,
    )

    if projection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return projection


@router.get(
    '/{project_id}/dashboard/charts/category-distribution',
    response_model=list[DashboardCategoryDistributionRead],
)
async def get_project_dashboard_category_distribution(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    projection = await financial_engine.get_dashboard_category_distribution(
        db,
        project_id,
        current_user.id,
    )

    if projection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return projection


@router.get(
    '/{project_id}/dashboard/charts/supplier-distribution',
    response_model=list[DashboardSupplierDistributionRead],
)
async def get_project_dashboard_supplier_distribution(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    projection = await financial_engine.get_dashboard_supplier_distribution(
        db,
        project_id,
        current_user.id,
    )

    if projection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return projection


# API ENDPOINT TO UPDATE A PROJECT
@router.patch('/{project_id}', response_model=ProjectRead)
async def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    try:
        project = await project_repository.update_project(
            db, project_id, project_data, current_user.id
        )
    except project_repository.ProjectValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error
    except IntegrityError as error:
        await raise_integrity_conflict(db, error)

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return project


# API ENDPOINT TO SOFT DELETE A PROJECT
@router.delete('/{project_id}', response_model=ProjectRead)
async def soft_delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    project = await project_repository.soft_delete_project(
        db, project_id, current_user.id
    )

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='Project not found'
        )

    return project
