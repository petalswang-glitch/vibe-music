import asyncio
import json
from contextlib import asynccontextmanager

import httpx
import pytest
import pytest_asyncio
from fastapi import HTTPException
from langchain_core.language_models.fake_chat_models import (
    FakeListChatModel,
    FakeMessagesListChatModel,
)
from langchain_core.messages import AIMessage
from pydantic import Field
from test_account import account as account
from test_account import bearer, login
from test_agent_config import TEST_KEY
from test_agent_config import personal_agent as personal_agent
from test_favorite import catalogue as catalogue
from test_favorite import other_identity

from app.agent.runtime import AgentRuntime
from app.api.routes.agent import streaming


class ScriptedModel(FakeMessagesListChatModel):
    seen: list = Field(default_factory=list)
    bound_names: list = Field(default_factory=list)

    def bind_tools(self, tools, **kwargs):
        self.bound_names = [t.name for t in tools]
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen.append(messages)
        result = super()._generate(messages, stop, run_manager, **kwargs).model_copy(deep=True)
        # The fake cycles the same message object; real provider responses have fresh IDs.
        for generation in result.generations:
            generation.message.id = None
        return result


class StreamingModel(FakeListChatModel):
    closed_streams: int = 0

    def bind_tools(self, tools, **kwargs):
        return self

    async def _astream(self, *args, **kwargs):
        try:
            async for part in super()._astream(*args, **kwargs):
                yield part
        finally:
            self.closed_streams += 1


@pytest_asyncio.fixture
async def agent(account, personal_agent):
    turns = []
    guard = asyncio.Lock()

    @asynccontextmanager
    async def factory():
        # Production uses separate SQLAlchemy sessions; tests share a rollback connection.
        async with guard:
            yield account["session"]

    class TrackedRuntime(AgentRuntime):
        async def prepare(self, *args, **kwargs):
            turn = await super().prepare(*args, **kwargs)
            turns.append(turn)
            return turn

    def make(model, **overrides):
        settings = account["app"].state.settings.model_copy(update=overrides)
        runtime = TrackedRuntime(
            settings, account["redis"], factory, account["app"].state.agent_http, model=model
        )
        account["app"].state.agent_runtime = runtime
        return runtime

    try:
        yield make, turns
    finally:
        keys = {key for turn in turns for key in (turn.history_key, turn.lock_key)}
        if keys:
            await account["redis"].delete(*keys)


async def test_graph_executes_real_catalogue_tool_and_filters_fabricated_cards(
    account, catalogue, agent
):
    identity = catalogue["songs"][0].id
    model = ScriptedModel(
        responses=[
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "searchSongs",
                        "args": {"keyword": "Café"},
                        "id": "call1",
                        "type": "tool_call",
                    }
                ],
            ),
            AIMessage(
                content="为你找到：<vibe-songs>"
                + json.dumps(
                    [{"songId": identity, "audioUrl": "https://fake"}, {"songId": 999999999}]
                )
                + "</vibe-songs>。"
            ),
        ]
    )
    runtime = agent[0](model)
    response = await account["client"].post(
        "/agent/chat", json={"conversationId": account["tag"], "query": "找Café歌曲"}
    )
    assert response.status_code == 200 and response.headers["content-type"].startswith(
        "text/event-stream"
    )
    assert response.headers["x-accel-buffering"] == "no"
    assert response.headers["cache-control"] == "no-cache, no-transform"
    assert "event: done" in response.text and "event: error" not in response.text
    assert (
        "Café Song" in response.text
        and "https://fake" not in response.text
        and "999999999" not in response.text
    )
    assert model.bound_names == [
        "searchSongs",
        "recommendSongsByStyle",
        "getHotSongs",
        "listStyles",
    ]
    assert model.seen[0][0].type == "system"
    assert model.seen[1][-1].type == "tool" and "Café Song" in model.seen[1][-1].content
    assert await runtime.redis.exists(agent[1][0].history_key)


async def test_guests_cannot_use_any_agent_endpoint_or_shared_owner_key(account, agent):
    model = ScriptedModel(responses=[AIMessage(content="must not be called")])
    agent[0](model)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=account["app"]), base_url="http://test"
    ) as client:
        assert (await client.post("/agent/chat", json={"query": "test"})).status_code == 401
        assert (await client.get("/agent/simple/chat")).status_code == 401
        assert (await client.get("/agent/stream/chat")).status_code == 401
    assert not model.seen


async def test_user_conversation_isolation_and_invalid_auth(account, agent):
    model = ScriptedModel(responses=[AIMessage(content="一"), AIMessage(content="二")])
    agent[0](model)
    first = await login(account)
    _, second = await other_identity(account)
    saved = await account["client"].put(
        "/user/agent-config",
        headers=bearer(second),
        json={"provider": "siliconflow", "modelName": "test-model", "apiKey": TEST_KEY},
    )
    assert saved.json()["code"] == 0
    body = {"conversationId": account["tag"], "query": "同一会话ID"}
    assert (
        await account["client"].post("/agent/chat", json=body, headers=bearer(first))
    ).status_code == 200
    assert (
        await account["client"].post("/agent/chat", json=body, headers=bearer(second))
    ).status_code == 200
    assert len(model.seen[1]) == 2 and agent[1][0].history_key != agent[1][1].history_key
    assert (
        await account["client"].post("/agent/chat", json=body, headers=bearer("invalid"))
    ).status_code == 401


async def test_original_get_endpoints_and_validation_origin(account, agent):
    model = ScriptedModel(responses=[AIMessage(content="你好"), AIMessage(content="继续")])
    agent[0](model)
    response = await account["client"].get("/agent/simple/chat")
    assert response.text == "你好" and response.headers["content-type"].startswith("text/plain")
    assert "很高兴认识你" in model.seen[0][-1].content
    response = await account["client"].get("/agent/stream/chat", params={"query": "继续"})
    assert "event: text" in response.text and "event: done" in response.text
    assert any(m.content == "你好" for m in model.seen[1])
    assert (
        await account["client"].post(
            "/agent/chat", json={"query": "x"}, headers={"Origin": "https://attacker.invalid"}
        )
    ).status_code == 403
    for body in (
        {"query": " "},
        {"query": "x" * 8001},
        {"query": "x", "conversationId": "../wrong"},
    ):
        assert (await account["client"].post("/agent/chat", json=body)).status_code == 422
    assert (
        await account["client"].get("/agent/simple/chat", params={"query": " "})
    ).status_code == 422


async def test_streaming_error_is_generic_and_does_not_commit_history(account, agent):
    model = StreamingModel(responses=["abc"], error_on_chunk_number=1)
    runtime = agent[0](model)
    response = await account["client"].post(
        "/agent/chat", json={"query": "test", "conversationId": account["tag"]}
    )
    assert "event: text\ndata: a" in response.text
    assert "event: error" in response.text and "event: done" not in response.text
    turn = agent[1][0]
    assert not await runtime.redis.exists(turn.history_key) and not await runtime.redis.exists(
        turn.lock_key
    )


async def test_cancel_closes_graph_model_and_releases_owned_lock(account, agent):
    model = StreamingModel(responses=["abcdefghij"], sleep=0.01)
    runtime = agent[0](model)
    turn = await runtime.prepare("cancel:" + account["tag"], "same", "test")
    stream = turn.stream()
    assert await anext(stream) == "a"
    await stream.aclose()
    assert not await runtime.redis.exists(turn.history_key) and not await runtime.redis.exists(
        turn.lock_key
    )
    assert model.closed_streams == 1


async def test_close_sse_body_closes_inner_model_before_releasing_lock(account, agent):
    from starlette.requests import Request

    model = StreamingModel(responses=["abcdefghij"], sleep=0.01)
    runtime = agent[0](model)
    turn = await runtime.prepare("response-close:" + account["tag"], "same", "test")
    request = Request({"type": "http", "app": account["app"]})
    response = streaming(request, turn, None)
    assert await anext(response.body_iterator) == "event: text\ndata: a\n\n"
    await response.body_iterator.aclose()
    assert model.closed_streams == 1
    assert not await runtime.redis.exists(turn.lock_key)
    assert not await runtime.redis.exists(turn.history_key)


@pytest.mark.parametrize("spec_version", ["2.3", "2.4"])
async def test_asgi_disconnect_during_send_closes_stream_immediately(account, agent, spec_version):
    from starlette.requests import ClientDisconnect, Request

    model = StreamingModel(responses=["abcdefghij"], sleep=0.01)
    runtime = agent[0](model)
    turn = await runtime.prepare("disconnect:" + account["tag"], "same", "test")
    response = streaming(Request({"type": "http", "app": account["app"]}), turn, None)
    body_sent = asyncio.Event()

    async def send(message):
        if message["type"] == "http.response.body":
            body_sent.set()
            if spec_version == "2.4":
                raise OSError("client closed")
            await asyncio.Event().wait()

    async def receive():
        await body_sent.wait()
        return {"type": "http.disconnect"}

    scope = {"type": "http", "asgi": {"spec_version": spec_version}}
    if spec_version == "2.4":
        with pytest.raises(ClientDisconnect):
            await asyncio.wait_for(response(scope, receive, send), 2)
    else:
        await asyncio.wait_for(response(scope, receive, send), 2)
    assert model.closed_streams == 1
    assert not await runtime.redis.exists(turn.lock_key)
    assert not await runtime.redis.exists(turn.history_key)


async def test_concurrent_turn_conflict_and_compare_release(account, agent):
    runtime = agent[0](ScriptedModel(responses=[AIMessage(content="ok")]))
    turn = await runtime.prepare(account["tag"], "one", "test")
    with pytest.raises(HTTPException) as error:
        await runtime.prepare(account["tag"], "one", "duplicate")
    assert error.value.status_code == 409
    other = await runtime.prepare(account["tag"], "two", "independent")
    await other.close()
    await runtime.redis.set(turn.lock_key, "new-owner", ex=30)
    await turn.close()
    assert await runtime.redis.get(turn.lock_key) == b"new-owner"


async def test_model_timeout_releases_lock_and_does_not_save(account, agent):
    runtime = agent[0](StreamingModel(responses=["abc"], sleep=0.1), agent_timeout_seconds=0.01)
    turn = await runtime.prepare(account["tag"], "timeout", "test")
    with pytest.raises(TimeoutError):
        _ = [part async for part in turn.stream()]
    assert not await runtime.redis.exists(turn.lock_key) and not await runtime.redis.exists(
        turn.history_key
    )


async def test_memory_window_keeps_twenty_messages_and_corrupt_history_is_not_reused(
    account, agent
):
    model = ScriptedModel(responses=[AIMessage(content="ok")])
    runtime = agent[0](model)
    for i in range(12):
        turn = await runtime.prepare(account["tag"], "window", str(i))
        _ = [part async for part in turn.stream()]
    history = json.loads(await runtime.redis.get(turn.history_key))
    assert len(history) == 20 and history[0]["type"] == "human"
    assert all(len(messages) <= 22 for messages in model.seen)
    assert 0 < await runtime.redis.ttl(turn.history_key) <= runtime.settings.agent_history_seconds
    await runtime.redis.set(turn.history_key, "broken")
    with pytest.raises(HTTPException) as error:
        await runtime.prepare(account["tag"], "window", "test")
    assert error.value.status_code == 503 and not await runtime.redis.exists(turn.lock_key)


async def test_missing_personal_model_key_is_preflight_409(account, agent):
    runtime = agent[0](None, model_api_key=None)
    await account["client"].delete("/user/agent-config")
    response = await account["client"].post("/agent/chat", json={"query": "test"})
    assert response.status_code == 409 and "配置自己的模型API Key" in response.json()["message"]
    assert not agent[1] and runtime.graph is None
