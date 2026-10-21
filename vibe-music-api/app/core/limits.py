"""Small Redis guards shared by all workers; client headers never define identity."""

import hashlib
import math
import secrets
import unicodedata
from dataclasses import dataclass

from fastapi import HTTPException

WINDOW = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('TTL', KEYS[1])}
"""
ACQUIRE = """
local clock = redis.call('TIME')
local now = tonumber(clock[1]) + tonumber(clock[2]) / 1000000
for i = 1, 2 do redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now) end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[1]) or
   redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[2]) then return 0 end
for i = 1, 2 do
  redis.call('ZADD', KEYS[i], now + tonumber(ARGV[3]), ARGV[4])
  redis.call('EXPIRE', KEYS[i], ARGV[3])
end
return 1
"""
RELEASE = """
for i = 1, 2 do redis.call('ZREM', KEYS[i], ARGV[1]) end
return 1
"""


def guard_key(bucket: str, identity: str) -> str:
    digest = hashlib.sha256(identity.encode()).hexdigest()
    return f"guard:v1:{bucket}:{digest}"


def peer(request) -> str:
    return request.client.host if request.client else "unknown"


async def window(redis, bucket: str, identity: str, limit: int, seconds: int):
    count, ttl = await redis.eval(WINDOW, 1, guard_key(bucket, identity), seconds)
    if count > limit:
        raise HTTPException(
            429, "请求过于频繁，请稍后重试", headers={"Retry-After": str(max(1, ttl))}
        )


async def login_limits(request, role: str, account: str):
    redis = request.app.state.redis
    await window(redis, "login-ip", peer(request), 30, 60)
    # Independent account key prevents changing IP from bypassing the account budget.
    normalized = "".join(
        char
        for char in unicodedata.normalize("NFKD", account.casefold())
        if not unicodedata.combining(char)
    )
    await window(redis, f"login-{role}", normalized, 10, 900)


async def mail_limits(request):
    await window(request.app.state.redis, "mail-ip", peer(request), 10, 3600)


async def agent_limits(request, owner: str):
    redis = request.app.state.redis
    await window(redis, "agent-ip-minute", peer(request), 20, 60)
    await window(redis, "agent-ip-hour", peer(request), 120, 3600)
    await window(redis, "agent-owner", owner, 20, 60)


@dataclass
class AgentLease:
    redis: object
    keys: tuple[str, str]
    token: str

    async def close(self):
        await self.redis.eval(RELEASE, 2, *self.keys, self.token)


async def acquire_agent(redis, settings, owner: str) -> AgentLease:
    keys = (guard_key("agent-active-owner", owner), "guard:v1:agent-active-global")
    token = secrets.token_hex(24)
    granted = await redis.eval(
        ACQUIRE,
        2,
        *keys,
        settings.agent_owner_concurrency,
        settings.agent_global_concurrency,
        math.ceil(settings.agent_timeout_seconds + 30),
        token,
    )
    if not granted:
        raise HTTPException(429, "当前生成请求较多，请稍后重试", headers={"Retry-After": "5"})
    return AgentLease(redis, keys, token)
