from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.security import decode_access_token
from app.db.session import get_session
from app.models import User

DB = Annotated[AsyncSession, Depends(get_session, scope="function")]
Config = Annotated[Settings, Depends(get_settings)]
bearer = HTTPBearer(auto_error=False)


async def current_user(
    db: DB,
    settings: Config,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> User:
    if credentials is None:
        raise HTTPException(401, "Bearer token required", headers={"WWW-Authenticate": "Bearer"})
    user = await db.get(User, decode_access_token(credentials.credentials, settings))
    if user is None:
        raise HTTPException(401, "User no longer exists")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


async def admin_user(user: CurrentUser, settings: Config) -> User:
    if user.telegram_id not in settings.admin_ids:
        raise HTTPException(403, "Administrator access required")
    return user


AdminUser = Annotated[User, Depends(admin_user)]
