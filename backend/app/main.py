from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, HTTPException, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.settings import settings
from app.db.session import engine, init_db
from app.errors import http_exception_handler, request_validation_exception_handler
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
    exports,
    issue_reports,
    trash,
    admin,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print('Server starting .....')
    await init_db()
    yield

    print('Server stopping .....')


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
app.include_router(trash.router)
app.include_router(admin.router)
