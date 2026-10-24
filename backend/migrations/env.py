from alembic import context
import os
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool
from app.database import Base, postgres_url
from app import models

url = postgres_url(os.getenv("DIRECT_DATABASE_URL") or os.environ["DATABASE_URL"])
if context.is_offline_mode():
    context.configure(
        url=url.render_as_string(hide_password=False),
        target_metadata=Base.metadata,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine(
        url,
        poolclass=NullPool,
        connect_args={"connect_timeout": 10, "prepare_threshold": None},
    )
    with engine.connect() as connection:
        context.configure(
            connection=connection, target_metadata=Base.metadata, compare_type=True
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()
