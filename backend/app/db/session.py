from collections.abc import AsyncIterator

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

engine = create_async_engine(get_settings().database_url, pool_pre_ping=True, hide_parameters=True)
SessionFactory = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionFactory() as session:
        session.info["production"] = get_settings().environment == "production"
        try:
            async with session.begin():
                yield session
        except IntegrityError as exc:
            raise HTTPException(409, "Operation conflicts with an existing record") from exc
