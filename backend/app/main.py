from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.db.session import init_db
from app.routers import suppliers

@asynccontextmanager
async def lifespan(app: FastAPI):
  print('Server starting .....')
  await init_db()
  yield

  print('Server stopping .....')

app = FastAPI(lifespan=lifespan)

app.include_router(suppliers.router)