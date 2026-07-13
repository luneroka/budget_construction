import logging

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text
from app.core.settings import settings

logger = logging.getLogger(__name__)

DB_URL = settings.database_url
assert DB_URL is not None, 'DATABASE_URL must be set'

engine = create_async_engine(url=DB_URL, echo=settings.database_echo)

AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 'Database Initialized'"))
    logger.info('Database connection verified')


async def get_db_session():
    async with AsyncSessionLocal() as session:
        yield session
