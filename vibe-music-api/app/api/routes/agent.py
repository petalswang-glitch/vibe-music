import asyncio
import logging
from contextlib import aclosing
from typing import Annotated

import anyio
from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.identity import owner
from app.agent.output import sse
from app.core.limits import agent_limits
from app.db.session import get_session
from app.schemas.agent import AgentChat
from app.services.agent_config import user_model_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])
Session = Annotated[AsyncSession, Depends(get_session, scope="function")]
INTRO = "你好，很高兴认识你，能简单介绍一下自己吗？"


class AgentStreamingResponse(StreamingResponse):
    def __init__(self, turn, *args, **kwargs):
        self.turn = turn
        super().__init__(*args, **kwargs)

    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            # ASGI 2.4 send failures skip background tasks and can leave a yielded
            # body iterator suspended. Close it before making the session available.
            with anyio.CancelScope(shield=True):
                try:
                    await self.body_iterator.aclose()
                finally:
                    await self.turn.close()


async def prepare(request, session, body):
    user = await owner(request, session)
    identity = f"user:{user.id}"
    await agent_limits(request, identity)
    settings = await user_model_settings(session, request.app.state.settings, user.id)
    turn = await request.app.state.agent_runtime.prepare(
        identity, body.conversation_id, body.query, model_settings=settings
    )
    return turn, None


def streaming(request, turn, token):
    async def events():
        try:
            async with aclosing(turn.stream()) as stream:
                async for delta in stream:
                    yield sse("text", delta)
            yield sse("done", "[DONE]")
        except asyncio.CancelledError:
            raise
        except Exception as error:
            # Never log prompts, credentials, provider response bodies or request headers.
            logger.warning("Agent stream failed (%s)", type(error).__name__)
            yield sse("error", "模型服务暂时不可用，请稍后重试")
        finally:
            await turn.close()

    response = AgentStreamingResponse(
        turn,
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
    return response


@router.post("/chat")
async def chat(body: AgentChat, request: Request, session: Session):
    turn, token = await prepare(request, session, body)
    return streaming(request, turn, token)


@router.get("/stream/chat")
async def stream_chat(request: Request, session: Session, query: str = INTRO):
    # Use the same validation and private default conversation for both debug endpoints.
    from fastapi import HTTPException
    from pydantic import ValidationError

    try:
        body = AgentChat(conversationId="debug", query=query)
    except ValidationError:
        raise HTTPException(422, "请求参数格式不正确") from None
    turn, token = await prepare(request, session, body)
    return streaming(request, turn, token)


@router.get("/simple/chat", response_class=PlainTextResponse)
async def simple_chat(request: Request, session: Session, query: str = INTRO):
    from fastapi import HTTPException
    from pydantic import ValidationError

    try:
        body = AgentChat(conversationId="debug", query=query)
    except ValidationError:
        raise HTTPException(422, "请求参数格式不正确") from None
    turn, token = await prepare(request, session, body)
    try:
        text = "".join([part async for part in turn.stream()])
    except Exception as error:
        logger.warning("Agent completion failed (%s)", type(error).__name__)
        raise HTTPException(502, "模型服务暂时不可用，请稍后重试") from None
    finally:
        await turn.close()
    response = PlainTextResponse(text, headers={"Cache-Control": "no-cache, no-transform"})
    return response
