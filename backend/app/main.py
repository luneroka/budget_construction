from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.db.session import init_db
from app.routers import (
    auth,
    users,
    suppliers,
    projects,
    categories,
    subcategories,
    products,
    catalog,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print('Server starting .....')
    await init_db()
    yield

    print('Server stopping .....')


app = FastAPI(lifespan=lifespan)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(suppliers.router)
app.include_router(projects.router)
app.include_router(categories.router)
app.include_router(subcategories.router)
app.include_router(products.router)
app.include_router(catalog.router)
