import secrets
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import HTTPException, Request
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import credential_version
from app.models import Admin


def session_key(admin_id: int, jti: str):
    return f"auth:session:ROLE_ADMIN:{admin_id}:{jti}"


async def issue_token(request: Request, admin: Admin) -> str:
    now = datetime.now(UTC)
    ttl = request.app.state.settings.auth_token_seconds
    jti = secrets.token_urlsafe(24)
    token = jwt.encode(
        {
            "iat": now,
            "exp": now + timedelta(seconds=ttl),
            "jti": jti,
            "claims": {"role": "ROLE_ADMIN", "adminId": admin.id, "username": admin.username},
        },
        request.app.state.auth_secret,
        algorithm="HS256",
    )
    await request.app.state.redis.set(
        session_key(admin.id, jti), credential_version(admin.password), ex=ttl
    )
    return token


async def authenticate(request: Request, session: AsyncSession) -> tuple[Admin, str]:
    value = request.headers.get("authorization", "")
    token = value[7:] if value.lower().startswith("bearer ") else value
    if not token:
        raise HTTPException(401, "未登录，请先登录")
    try:
        payload = jwt.decode(
            token,
            request.app.state.auth_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "iat", "jti", "claims"]},
        )
        claims = payload["claims"]
        if claims["role"] != "ROLE_ADMIN":
            raise HTTPException(403, "您没有权限访问此资源")
        admin_id, jti = claims["adminId"], payload["jti"]
        if type(admin_id) is not int or not 0 < admin_id <= 2**63 - 1 or not isinstance(jti, str):
            raise ValueError("invalid identity")
    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError):
        raise HTTPException(401, "会话过期，请重新登录") from None
    try:
        version = await request.app.state.redis.get(session_key(admin_id, jti))
    except RedisError:
        raise HTTPException(503, "会话服务暂时不可用") from None
    admin = await session.scalar(select(Admin).where(Admin.id == admin_id))
    if not admin or not version or version.decode() != credential_version(admin.password):
        raise HTTPException(401, "会话过期，请重新登录")
    return admin, jti
