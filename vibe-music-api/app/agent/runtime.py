import asyncio
import hashlib
import json
import logging
import math
import secrets
from contextlib import aclosing
from dataclasses import dataclass

import anyio
from fastapi import HTTPException
from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    messages_from_dict,
    messages_to_dict,
    trim_messages,
)

from app.agent.adapters import create_model
from app.agent.graph import build_graph, songs_from_messages
from app.agent.output import SongTagFilter, sanitize_text, text_content
from app.core.limits import AgentLease, acquire_agent

logger = logging.getLogger(__name__)
RELEASE = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else return 0 end
"""


class AgentRuntime:
    def __init__(self, settings, redis, session_factory, http_client, *, model=None):
        self.settings = settings
        self.redis = redis
        self.session_factory = session_factory
        self.http_client = http_client
        self.model = model
        self.graph = None

    async def prepare(self, owner: str, conversation: str, query: str, *, model_settings=None):
        if self.model is not None:
            # Explicit model injection exists for isolated tests, never from an HTTP request.
            if self.graph is None:
                self.graph = build_graph(self.model, self.session_factory)
            graph = self.graph
        elif model_settings is not None:
            # A graph belongs to this turn's authenticated user. Never cache another
            # user's model/key, and never fall back to the application's MODEL_API_KEY.
            graph = build_graph(
                create_model(model_settings, self.http_client), self.session_factory
            )
        else:
            raise HTTPException(409, "请先配置自己的模型API Key")
        digest = hashlib.sha256(f"{owner}:{conversation}".encode()).hexdigest()
        key = f"agent:history:{digest}"
        lock = f"agent:lock:{digest}"
        token = secrets.token_hex(24)
        if not await self.redis.set(
            lock, token, nx=True, ex=math.ceil(self.settings.agent_timeout_seconds + 30)
        ):
            raise HTTPException(409, "当前会话正在生成，请稍候")
        turn = AgentTurn(self, key, lock, token, [], query, graph=graph)
        try:
            turn.lease = await acquire_agent(self.redis, self.settings, owner)
            raw = await self.redis.get(key)
            if raw:
                data = json.loads(raw)
                if not isinstance(data, list) or len(data) > 20:
                    raise ValueError("invalid conversation")
                turn.messages = messages_from_dict(data)
                if any(message.type not in ("human", "ai", "tool") for message in turn.messages):
                    raise ValueError("invalid message")
            return turn
        except (ValueError, KeyError, TypeError):
            await turn.close()
            raise HTTPException(503, "会话记录不可用，请新建会话") from None
        except BaseException:
            await turn.close()
            raise


@dataclass
class AgentTurn:
    runtime: AgentRuntime
    history_key: str
    lock_key: str
    token: str
    messages: list
    query: str
    graph: object = None
    lease: AgentLease | None = None
    closed: bool = False

    async def close(self):
        if self.closed:
            return
        self.closed = True
        with anyio.CancelScope(shield=True):
            try:
                await self.runtime.redis.eval(RELEASE, 1, self.lock_key, self.token)
            except Exception:
                logger.warning("Agent lock cleanup failed; it will expire")
            finally:
                if self.lease is not None:
                    try:
                        await self.lease.close()
                    except Exception:
                        logger.warning("Agent capacity cleanup failed; it will expire")

    async def stream(self):
        runtime = self.runtime
        messages = [*self.messages, HumanMessage(self.query)]
        approved = songs_from_messages(self.messages)
        state = {"messages": messages, "songs": approved}
        filter = SongTagFilter()
        sent = False
        try:
            async with asyncio.timeout(runtime.settings.agent_timeout_seconds):
                events = self.graph.astream(
                    state, {"recursion_limit": 16}, stream_mode=["messages", "values"], version="v2"
                )
                async with aclosing(events):
                    async for part in events:
                        if part["type"] == "values":
                            state = part["data"]
                            approved = state["songs"]
                        elif part["type"] == "messages":
                            message, metadata = part["data"]
                            if metadata.get("langgraph_node") != "model" or not isinstance(
                                message, AIMessage
                            ):
                                continue
                            delta = filter.push(text_content(message.content), approved)
                            if delta:
                                sent = True
                                yield delta
                tail = filter.finish()
                if tail:
                    sent = True
                    yield tail
                if not sent:
                    raise RuntimeError("empty model response")
                messages = state["messages"]
                if isinstance(messages[-1], AIMessage):
                    messages[-1] = messages[-1].model_copy(
                        update={
                            "content": sanitize_text(text_content(messages[-1].content), approved)
                        }
                    )
                history = trim_messages(
                    messages,
                    max_tokens=20,
                    token_counter=len,
                    strategy="last",
                    start_on="human",
                    include_system=False,
                )
                await runtime.redis.set(
                    self.history_key,
                    json.dumps(messages_to_dict(history), ensure_ascii=False),
                    ex=runtime.settings.agent_history_seconds,
                )
        finally:
            await self.close()
