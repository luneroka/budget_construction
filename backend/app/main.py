from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import sentry_sdk
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.settings import settings
from app.core.sentry import init_sentry
from app.db.session import engine, init_db
from app.errors import (
    error_detail,
    http_exception_handler,
    request_validation_exception_handler,
)
from app.routers import (
    auth,
    users,
    suppliers,
    projects,
    categories,
    subcategories,
    products,
    catalog,
    templates,
    template_items,
    budget_lines,
    transactions,
    documents,
    supplier_documents,
    exports,
    issue_reports,
    trash,
    admin,
)

logging.basicConfig(
    level=logging.DEBUG if settings.app_environment != 'production' else logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s: %(message)s',
)
logger = logging.getLogger(__name__)

init_sentry()


class HealthCheckAccessLogFilter(logging.Filter):
    """Drops uvicorn access-log lines for the container healthcheck paths.

    They fire every 15s regardless of real traffic and would otherwise
    dominate the bounded log budget, drowning out genuine signal.
    """

    _EXCLUDED_PATHS = frozenset({'/health/live', '/health/ready'})

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if not isinstance(args, tuple) or len(args) < 3:
            return True
        return args[2] not in self._EXCLUDED_PATHS


logging.getLogger('uvicorn.access').addFilter(HealthCheckAccessLogFilter())


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info('Server starting')
    await init_db()
    yield

    logger.info('Server stopping')


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
    expose_headers=['Content-Disposition'],
)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, request_validation_exception_handler)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # A registered handler for a specific exception type (StarletteHTTPException,
    # RequestValidationError above) always wins over this one, so only truly
    # unexpected exceptions land here. Sentry does not auto-capture exceptions
    # that a custom handler intercepts, hence the explicit capture_exception.
    logger.exception('Unhandled exception on %s %s', request.method, request.url.path)
    sentry_sdk.capture_exception(exc)

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            'detail': error_detail(
                'internal_server_error', message='Internal server error'
            )
        },
    )


@app.get('/health/live', include_in_schema=False)
async def liveness_check() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/health/ready', include_in_schema=False)
async def readiness_check() -> dict[str, str]:
    try:
        async with engine.connect() as connection:
            await connection.execute(text('SELECT 1'))
    except Exception as exc:
        logger.exception('Readiness check failed')
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='Database is unavailable',
        ) from exc

    return {'status': 'ok'}

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(categories.router)
app.include_router(subcategories.router)
app.include_router(products.router)
app.include_router(catalog.router)
app.include_router(templates.router)
app.include_router(template_items.router)
app.include_router(projects.router)
app.include_router(budget_lines.router)
app.include_router(budget_lines.product_router)
app.include_router(exports.router)
app.include_router(issue_reports.router)
app.include_router(transactions.project_router)
app.include_router(transactions.router)
app.include_router(transactions.product_router)
app.include_router(suppliers.router)
app.include_router(documents.router)
app.include_router(documents.document_router)
app.include_router(supplier_documents.router)
app.include_router(supplier_documents.supplier_document_router)
app.include_router(trash.router)
app.include_router(admin.router)
