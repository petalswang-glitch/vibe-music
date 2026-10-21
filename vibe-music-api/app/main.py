import logging
import secrets
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from minio import Minio
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.exceptions import HTTPException

from app.agent.runtime import AgentRuntime
from app.api.routes import (
    account,
    admin,
    admin_artist,
    admin_banner,
    admin_playlist,
    admin_song,
    admin_user,
    agent,
    agent_config,
    catalogue,
    community,
    favorite,
    health,
    media,
    song,
)
from app.core.config import Settings, get_settings
from app.core.security import BusinessError

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        engine = create_async_engine(
            config.database_url, pool_pre_ping=True, connect_args={"timeout": 5}
        )
        redis = Redis.from_url(config.redis_url, socket_connect_timeout=3, socket_timeout=3)
        application.state.engine = engine
        application.state.session_factory = async_sessionmaker(engine, expire_on_commit=False)
        application.state.redis = redis
        application.state.media_store = Minio(
            config.minio_endpoint,
            access_key=config.minio_access_key,
            secret_key=config.minio_secret_key,
            secure=config.minio_secure,
            region=config.minio_region,
        )
        application.state.media_http = httpx.AsyncClient(
            timeout=httpx.Timeout(30, connect=5),
            follow_redirects=False,
            trust_env=False,
        )
        application.state.agent_http = httpx.AsyncClient(
            timeout=config.agent_timeout_seconds, trust_env=False
        )
        application.state.agent_runtime = AgentRuntime(
            config, redis, application.state.session_factory, application.state.agent_http
        )
        try:
            yield
        finally:
            await application.state.agent_http.aclose()
            await application.state.media_http.aclose()
            await redis.aclose()
            await engine.dispose()

    application = FastAPI(title="Vibe Music API", version="0.1.0", lifespan=lifespan)
    application.state.settings = config
    application.state.auth_secret = (
        config.auth_secret.get_secret_value() if config.auth_secret else secrets.token_urlsafe(48)
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @application.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, _error: RequestValidationError):
        path = _request.url.path.removeprefix(_request.scope.get("root_path", ""))
        if path.startswith("/user/") or path == "/admin/login":
            error = _error.errors()[0]
            field = str(error["loc"][-1])
            label = {
                "email": "邮箱",
                "password": "密码",
                "oldPassword": "密码",
                "newPassword": "密码",
                "repeatPassword": "密码",
                "username": "用户名",
                "verificationCode": "验证码",
                "phone": "手机号",
                "introduction": "简介",
            }.get(field)
            message = (
                (f"{label}不能为空" if error["type"] == "missing" else f"{label}格式不正确")
                if label
                else "请求参数格式不正确"
            )
            return JSONResponse(content={"code": 1, "message": message, "data": None})
        return JSONResponse(
            status_code=422, content={"code": 1, "message": "请求参数格式不正确", "data": None}
        )

    @application.exception_handler(BusinessError)
    async def business_error(_request: Request, error: BusinessError):
        return JSONResponse(content={"code": 1, "message": str(error), "data": None})

    @application.exception_handler(RedisError)
    async def redis_error(_request: Request, _error: RedisError):
        return JSONResponse(
            status_code=503, content={"code": 1, "message": "会话服务暂时不可用", "data": None}
        )

    @application.exception_handler(HTTPException)
    async def http_error(_request: Request, error: HTTPException):
        return JSONResponse(
            status_code=error.status_code,
            content={"code": 1, "message": str(error.detail), "data": None},
            headers=error.headers,
        )

    @application.exception_handler(Exception)
    async def server_error(_request: Request, error: Exception):
        logger.error("Unhandled API error", exc_info=error)
        return JSONResponse(
            status_code=500, content={"code": 1, "message": "服务暂时不可用", "data": None}
        )

    application.include_router(health.router)
    application.include_router(agent.router)
    application.include_router(agent_config.router)
    application.include_router(song.router)
    application.include_router(catalogue.router)
    application.include_router(account.router)
    application.include_router(admin.router)
    application.include_router(admin_user.router)
    application.include_router(admin_artist.router)
    application.include_router(admin_song.router)
    application.include_router(admin_playlist.router)
    application.include_router(admin_banner.router)
    application.include_router(favorite.router)
    application.include_router(community.router)
    application.include_router(media.router)
    return application


app = create_app()
