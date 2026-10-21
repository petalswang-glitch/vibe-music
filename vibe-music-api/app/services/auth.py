import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage

import aiosmtplib
import jwt
from fastapi import HTTPException, Request
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import BusinessError, credential_version
from app.models import User

CONSUME_CODE = """
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
if current ~= ARGV[1] then
  local count = redis.call('INCR', KEYS[2])
  if count == 1 then redis.call('EXPIRE', KEYS[2], 300) end
  if count >= 5 then redis.call('DEL', KEYS[1]) end
  return 0
end
redis.call('DEL', KEYS[1], KEYS[2])
return 1
"""


def email_key(email: str) -> str:
    return hashlib.sha256(email.lower().encode()).hexdigest()


def code_digest(request: Request, email: str, code: str) -> str:
    return hmac.new(
        request.app.state.auth_secret.encode(), f"{email.lower()}:{code}".encode(), hashlib.sha256
    ).hexdigest()


def session_key(user_id: int, jti: str) -> str:
    return f"auth:session:ROLE_USER:{user_id}:{jti}"


async def send_code(request: Request, email: str):
    redis = request.app.state.redis
    key = email_key(email)
    if not await redis.set(f"auth:cooldown:{key}", "1", nx=True, ex=60):
        raise HTTPException(429, "请60秒后再获取验证码")
    code = "".join(
        secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")
        for _ in range(6)
    )
    config = request.app.state.settings
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = (
        config.smtp_from,
        email,
        "【Vibe Music】验证码",
    )
    message.set_content(f"您的验证码为：{code}\n有效期5分钟，请勿转发。")
    try:
        await aiosmtplib.send(
            message,
            hostname=config.smtp_host,
            port=config.smtp_port,
            username=config.smtp_username,
            password=config.smtp_password.get_secret_value() if config.smtp_password else None,
            start_tls=config.smtp_start_tls,
            use_tls=config.smtp_use_tls,
            timeout=10,
        )
    except (aiosmtplib.SMTPException, OSError):
        await redis.delete(f"auth:cooldown:{key}")
        raise BusinessError("邮件发送失败") from None
    async with redis.pipeline(transaction=True) as pipe:
        pipe.set(f"auth:code:{key}", code_digest(request, email, code), ex=300)
        pipe.delete(f"auth:attempts:{key}")
        await pipe.execute()


async def consume_code(request: Request, email: str, code: str):
    key = email_key(email)
    matched = await request.app.state.redis.eval(
        CONSUME_CODE,
        2,
        f"auth:code:{key}",
        f"auth:attempts:{key}",
        code_digest(request, email, code),
    )
    if not matched:
        raise BusinessError("验证码无效")


async def issue_token(request: Request, user: User) -> str:
    now = datetime.now(UTC)
    ttl = request.app.state.settings.auth_token_seconds
    jti = secrets.token_urlsafe(24)
    payload = {
        "iat": now,
        "exp": now + timedelta(seconds=ttl),
        "jti": jti,
        "claims": {
            "role": "ROLE_USER",
            "userId": user.id,
            "username": user.username,
            "email": user.email,
        },
    }
    token = jwt.encode(payload, request.app.state.auth_secret, algorithm="HS256")
    await request.app.state.redis.set(
        session_key(user.id, jti), credential_version(user.password), ex=ttl
    )
    return token


async def authenticate(request: Request, session: AsyncSession) -> tuple[User, str]:
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
        if claims["role"] != "ROLE_USER":
            raise HTTPException(403, "您没有权限访问此资源")
        user_id, jti = claims["userId"], payload["jti"]
        if type(user_id) is not int or user_id < 1 or not isinstance(jti, str):
            raise ValueError("invalid identity")
    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError):
        raise HTTPException(401, "会话过期，请重新登录") from None
    try:
        version = await request.app.state.redis.get(session_key(user_id, jti))
    except RedisError:
        raise HTTPException(503, "会话服务暂时不可用") from None
    user = await session.scalar(select(User).where(User.id == user_id))
    if not user or not version or version.decode() != credential_version(user.password):
        raise HTTPException(401, "会话过期，请重新登录")
    if user.status != 0:
        raise HTTPException(403, "账号被锁定")
    return user, jti


async def optional_user_id(request: Request, session: AsyncSession) -> int | None:
    if not request.headers.get("authorization"):
        return None
    try:
        user, _ = await authenticate(request, session)
        return user.id
    except HTTPException as error:
        if error.status_code in (401, 403):
            return None
        raise


async def locked_user(request: Request, session: AsyncSession) -> User:
    identity, _ = await authenticate(request, session)
    user = await session.scalar(
        select(User)
        .where(User.id == identity.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if user is None:
        raise HTTPException(401, "会话过期，请重新登录")
    await authenticate(request, session)
    return user
