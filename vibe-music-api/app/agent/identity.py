from fastapi import HTTPException

from app.services.auth import authenticate


async def owner(request, session):
    origin = request.headers.get("origin")
    if origin and origin not in request.app.state.settings.cors_origins:
        raise HTTPException(403, "请求来源不允许")
    user, _ = await authenticate(request, session)
    return user
