import asyncio
from logging.config import fileConfig
import os

from sqlalchemy import inspect, pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from app.core.settings import settings
from app.db.base import Base
import app.models  # type: ignore # noqa: F401

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

db_url = settings.database_url
if db_url is None:
    raise ValueError('DATABASE_URL must be set')

config.set_main_option('sqlalchemy.url', db_url)

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option('sqlalchemy.url')
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={'paramstyle': 'named'},
    )

    with context.begin_transaction():
        context.run_migrations()


def refuse_empty_database(connection: Connection) -> None:
    """Fail closed instead of building a fresh schema over missing data.

    `alembic upgrade head` on a database that has never been migrated creates
    an empty schema, after which the API comes up healthy with no data at all.
    In production that is never a first install: it is a new or wrongly
    mounted data volume (a PostgreSQL major upgrade moves the mount path, for
    one). So when ALEMBIC_REFUSE_EMPTY_DATABASE=1 -- set by the production
    migrate service -- an unmigrated database stops the deploy, and the backend,
    which waits on migrate, never starts. CI and tests leave it unset.
    """
    if os.environ.get('ALEMBIC_REFUSE_EMPTY_DATABASE', '0') != '1':
        return
    if inspect(connection).has_table('alembic_version'):
        return
    raise RuntimeError(
        'Refusing to migrate a database that has never been migrated: in '
        'production this means a new or wrongly mounted data volume, not a '
        'first install. Restore a backup into it first (see the runbook). For '
        'a deliberate first install, run once with '
        'ALEMBIC_REFUSE_EMPTY_DATABASE=0.'
    )


def do_run_migrations(connection: Connection) -> None:
    refuse_empty_database(connection)
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """In this scenario we need to create an Engine
    and associate a connection with the context.

    """

    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix='sqlalchemy.',
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""

    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
