import asyncio
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from langchain_core.messages import AIMessage
from test_account import account as account
from test_admin import admin as admin
from test_agent_config import personal_agent as personal_agent
from test_agent_runtime import ScriptedModel
from test_agent_runtime import agent as agent

from app.core.limits import acquire_agent, guard_key, window


async def test_login_account_budget_survives_case_and_ip_changes(account):
    for index in range(11):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=account["app"], client=(f"192.0.2.{index}", 1234)),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/user/login",
                json={"email": account["email"].upper(), "password": "WrongPass123!"},
            )
        assert response.status_code == (200 if index < 10 else 429)
    assert int(response.headers["retry-after"]) > 0
    assert account["user"].password[:1] != "$"  # Rejected attempts did not upgrade/change it.


async def test_admin_budget_uses_independent_case_insensitive_account_key(account, admin):
    for index in range(11):
        response = await account["client"].post(
            "/admin/login", json={"username": admin.username.upper(), "password": "Wrong123!"}
        )
        assert response.status_code == (200 if index < 10 else 429)


async def test_ip_budget_cannot_be_bypassed_with_headers_or_different_accounts(account):
    for index in range(31):
        response = await account["client"].post(
            "/user/login",
            json={"email": f"missing{index}@example.com", "password": "WrongPass123!"},
            headers={"X-Forwarded-For": f"198.51.100.{index}", "X-Real-IP": str(index)},
        )
        assert response.status_code == (200 if index < 30 else 429)


async def test_mail_ip_budget_applies_to_different_recipient_addresses(account, monkeypatch):
    send = AsyncMock()
    monkeypatch.setattr("app.api.routes.account.send_code", send)
    for index in range(11):
        response = await account["client"].get(
            "/user/sendVerificationCode", params={"email": f"mail{index}@example.com"}
        )
        assert response.status_code == (200 if index < 10 else 429)
    assert send.await_count == 10


async def test_agent_cookie_and_conversation_rotation_cannot_bypass_ip_budget(account, agent):
    model = ScriptedModel(responses=[AIMessage(content="ok")])
    agent[0](model)
    for index in range(21):
        account["client"].cookies.clear()
        response = await account["client"].post(
            "/agent/chat", json={"conversationId": f"new-{index}", "query": "hello"}
        )
        assert response.status_code == (200 if index < 20 else 429)
    assert len(model.seen) == 20
    assert (await account["client"].get("/agent/simple/chat")).status_code == 429
    assert (await account["client"].get("/agent/stream/chat")).status_code == 429


async def test_parallel_rate_budget_is_atomic_and_expiry_allows_recovery(account):
    redis = account["redis"]
    outcomes = await asyncio.gather(
        *(window(redis, "test", "one", 3, 60) for _ in range(10)), return_exceptions=True
    )
    assert sum(value is None for value in outcomes) == 3
    assert (
        sum(isinstance(value, HTTPException) and value.status_code == 429 for value in outcomes)
        == 7
    )
    key = guard_key("test", "one")
    assert 0 < await redis.ttl(key) <= 60
    await redis.pexpire(key, 1)
    # Wait only for the explicit Redis expiry, not a real throttling window.
    await asyncio.sleep(0.02)
    await window(redis, "test", "one", 3, 60)


async def test_owner_and_global_capacity_survive_new_conversations_and_release(account, agent):
    runtime = agent[0](
        ScriptedModel(responses=[AIMessage(content="ok")]),
        agent_owner_concurrency=2,
        agent_global_concurrency=3,
    )
    first = await runtime.prepare("owner-a", "one", "hello")
    second = await runtime.prepare("owner-a", "two", "hello")
    with pytest.raises(HTTPException) as error:
        await runtime.prepare("owner-a", "three", "hello")
    assert error.value.status_code == 429
    third = await runtime.prepare("owner-b", "one", "hello")
    with pytest.raises(HTTPException) as error:
        await runtime.prepare("owner-c", "one", "hello")
    assert error.value.status_code == 429
    await second.close()
    replacement = await runtime.prepare("owner-c", "one", "hello")
    await asyncio.gather(first.close(), third.close(), replacement.close())
    assert await runtime.redis.zcard("guard:v1:agent-active-global") == 0


async def test_capacity_reclaims_expired_leases_without_leaking_failed_session_lock(account, agent):
    runtime = agent[0](
        ScriptedModel(responses=[AIMessage(content="ok")]),
        agent_owner_concurrency=1,
        agent_global_concurrency=1,
    )
    lease = await acquire_agent(runtime.redis, runtime.settings, "owner")
    assert 0 < await runtime.redis.ttl(lease.keys[0]) <= 150
    for key in lease.keys:
        await runtime.redis.zadd(key, {lease.token: 0})
    turn = await runtime.prepare("owner", "one", "hello")
    assert [part async for part in turn.stream()] == ["ok"]
    assert not await runtime.redis.exists(turn.lock_key)
    assert await runtime.redis.zcard(lease.keys[1]) == 0
