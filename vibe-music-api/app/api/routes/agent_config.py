from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models import UserAgentConfig
from app.schemas.agent import AgentConfigInput
from app.schemas.song import Result
from app.services import agent_config
from app.services.auth import authenticate, locked_user

router = APIRouter(prefix="/user/agent-config", tags=["agent settings"])
Session = Annotated[AsyncSession, Depends(get_session)]


@router.get("")
async def get_config(request: Request, response: Response, session: Session):
    user, _ = await authenticate(request, session)
    row = await session.get(UserAgentConfig, user.id)
    response.headers["Cache-Control"] = "private, no-store"
    return Result(data=agent_config.view(row))


@router.put("")
async def put_config(
    body: AgentConfigInput, request: Request, response: Response, session: Session
):
    user = await locked_user(request, session)
    data = await agent_config.save(session, request.app.state.settings, user, body)
    response.headers["Cache-Control"] = "private, no-store"
    return Result(message="Agent配置已保存", data=data)


@router.delete("")
async def delete_config(request: Request, response: Response, session: Session):
    user = await locked_user(request, session)
    await session.execute(delete(UserAgentConfig).where(UserAgentConfig.user_id == user.id))
    await session.commit()
    response.headers["Cache-Control"] = "private, no-store"
    return Result(message="Agent Key已移除", data=None)
