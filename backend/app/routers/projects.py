from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories import budget_line as budget_line_repository
from app.repositories import project as project_repository
from app.routers._helpers import require_found
from app.routers.integrity import raise_integrity_conflict
from app.schemas.financial_engine import (
    DashboardBudgetAlertsRead,
    DashboardCategoryBudgetActualRead,
    DashboardCategoryDistributionRead,
    DashboardFinancialOverviewRead,
    DashboardSpendingOverTimePointRead,
    DashboardSupplierDistributionRead,
    DashboardTransactionWidgetRead,
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
    return require_found(
        await project_repository.get_project_by_id(
            db, project_id, current_user.id, include_deleted=include_deleted
        ),
        'project_not_found',
    )


# Read-only projections of the financial engine. They all take the same
# (db, project_id, user_id) arguments and answer 404 when the project is not
# visible to the user, so they are registered from a table instead of twelve
# identical handlers.
Projection = Callable[[AsyncSession, int, int], Awaitable[object | None]]

FINANCIAL_PROJECTIONS: list[tuple[str, str, type[BaseModel] | object, Projection]] = [
    (
        'get_project_financial_summary',
        '/{project_id}/financial-summary',
        ProjectFinancialSummaryRead,
        financial_engine.get_project_summary,
    ),
    (
        'get_project_dashboard_financial_overview',
        '/{project_id}/dashboard/financial-overview',
        DashboardFinancialOverviewRead,
        financial_engine.get_dashboard_financial_overview,
    ),
    (
        'get_project_dashboard_spending_over_time',
        '/{project_id}/dashboard/charts/spending-over-time',
        list[DashboardSpendingOverTimePointRead],
        financial_engine.get_dashboard_spending_over_time,
    ),
    (
        'get_project_dashboard_budget_vs_actual',
        '/{project_id}/dashboard/charts/budget-vs-actual',
        list[DashboardCategoryBudgetActualRead],
        financial_engine.get_dashboard_budget_vs_actual,
    ),
    (
        'get_project_dashboard_category_distribution',
        '/{project_id}/dashboard/charts/category-distribution',
        list[DashboardCategoryDistributionRead],
        financial_engine.get_dashboard_category_distribution,
    ),
    (
        'get_project_dashboard_supplier_distribution',
        '/{project_id}/dashboard/charts/supplier-distribution',
        list[DashboardSupplierDistributionRead],
        financial_engine.get_dashboard_supplier_distribution,
    ),
    (
        'get_project_dashboard_unpaid_invoices',
        '/{project_id}/dashboard/widgets/unpaid-invoices',
        DashboardTransactionWidgetRead,
        financial_engine.get_dashboard_unpaid_invoices,
    ),
    (
        'get_project_dashboard_quotes_to_confirm',
        '/{project_id}/dashboard/widgets/quotes-to-confirm',
        DashboardTransactionWidgetRead,
        financial_engine.get_dashboard_quotes_to_confirm,
    ),
    (
        'get_project_dashboard_quotes_to_negotiate',
        '/{project_id}/dashboard/widgets/quotes-to-negotiate',
        DashboardTransactionWidgetRead,
        financial_engine.get_dashboard_quotes_to_negotiate,
    ),
    (
        'get_project_dashboard_budget_to_validate',
        '/{project_id}/dashboard/widgets/budget-to-validate',
        DashboardTransactionWidgetRead,
        financial_engine.get_dashboard_budget_to_validate,
    ),
    (
        'get_project_dashboard_missing_documents',
        '/{project_id}/dashboard/widgets/missing-documents',
        DashboardTransactionWidgetRead,
        financial_engine.get_dashboard_missing_documents,
    ),
    (
        'get_project_dashboard_recent_transactions',
        '/{project_id}/dashboard/widgets/recent-transactions',
        DashboardTransactionWidgetRead,
        financial_engine.get_dashboard_recent_transactions,
    ),
    (
        'get_project_dashboard_budget_alerts',
        '/{project_id}/dashboard/widgets/budget-alerts',
        DashboardBudgetAlertsRead,
        financial_engine.get_dashboard_budget_alerts,
    ),
]


def _projection_endpoint(name: str, projection: Projection):
    async def endpoint(
        project_id: int,
        db: AsyncSession = Depends(get_db_session),
        current_user: User = Depends(get_current_user),
    ):
        return require_found(
            await projection(db, project_id, current_user.id), 'project_not_found'
        )

    endpoint.__name__ = name
    return endpoint


for _name, _path, _response_model, _projection in FINANCIAL_PROJECTIONS:
    router.add_api_route(
        _path,
        _projection_endpoint(_name, _projection),
        methods=['GET'],
        response_model=_response_model,
        name=_name,
    )


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

    return require_found(project, 'project_not_found')


# API ENDPOINT TO SOFT DELETE A PROJECT
@router.delete('/{project_id}', response_model=ProjectRead)
async def soft_delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return require_found(
        await project_repository.soft_delete_project(db, project_id, current_user.id),
        'project_not_found',
    )
