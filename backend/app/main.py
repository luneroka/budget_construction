from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.settings import settings
from app.db.session import init_db
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
    admin,
)


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
)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, request_validation_exception_handler)

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
app.include_router(transactions.router)
app.include_router(transactions.product_router)
app.include_router(suppliers.router)
app.include_router(documents.router)
app.include_router(documents.document_router)
app.include_router(admin.router)
