import asyncio
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

router = APIRouter(prefix="/health", tags=["health"])
logger = logging.getLogger(__name__)


@router.get("/live")
async def live():
    return {"status": "ok"}


@router.get("/ready")
async def ready(request: Request):
    checks = {"postgres": False, "redis": False}
    try:
        async with asyncio.timeout(3):
            async with request.app.state.engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
            checks["postgres"] = True
    except Exception:
        logger.warning("PostgreSQL readiness check failed")
    try:
        async with asyncio.timeout(3):
            checks["redis"] = bool(await request.app.state.redis.ping())
    except Exception:
        logger.warning("Redis readiness check failed")
    healthy = all(checks.values())
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "ok" if healthy else "unavailable", "checks": checks},
    )
