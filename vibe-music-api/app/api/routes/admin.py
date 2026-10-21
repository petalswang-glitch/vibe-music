from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.limits import login_limits
from app.core.security import BusinessError, hash_password, verify_password
from app.db.session import get_session
from app.models import Admin, Feedback
from app.repositories import catalogue as repository
from app.schemas.admin import AdminLogin, FeedbackQuery, FeedbackView, LegacyId
from app.schemas.song import PageResult, Result
from app.services import admin_auth

router = APIRouter(prefix="/admin", tags=["admin"])
Session = Annotated[AsyncSession, Depends(get_session)]


async def administrator(request: Request, session: Session):
    admin, _ = await admin_auth.authenticate(request, session)
    return admin


Administrator = Annotated[Admin, Depends(administrator)]


@router.post("/login", response_model=Result[str])
async def login(body: AdminLogin, request: Request, session: Session):
    await login_limits(request, "admin", body.username)
    admin = await session.scalar(
        select(Admin).where(Admin.username == body.username).with_for_update()
    )
    if admin is None:
        raise BusinessError("用户名错误")
    valid, upgrade = await verify_password(body.password, admin.password)
    if not valid:
        raise BusinessError("密码错误")
    if upgrade:
        admin.password = await hash_password(body.password)
    await session.commit()
    return Result(message="登录成功", data=await admin_auth.issue_token(request, admin))


@router.get("/session")
async def session_info(admin: Administrator, response: Response):
    # A read-only identity probe for client auth restoration; no registration API.
    response.headers["Cache-Control"] = "private, no-store"
    return Result(data={"adminId": admin.id, "username": admin.username})


@router.post("/logout", response_model=Result[None])
async def logout(request: Request, session: Session):
    admin, jti = await admin_auth.authenticate(request, session)
    await request.app.state.redis.delete(admin_auth.session_key(admin.id, jti))
    return Result(message="登出成功", data=None)


@router.post("/getAllFeedbacks", response_model=Result[PageResult[FeedbackView]])
async def feedbacks(
    query: FeedbackQuery, admin: Administrator, response: Response, session: Session
):
    statement = select(
        Feedback.id.label("feedback_id"), Feedback.user_id, Feedback.feedback, Feedback.create_time
    )
    if query.keyword is not None:
        statement = statement.where(repository.contains(Feedback.feedback, query.keyword))
    total, rows = await repository.page(
        session,
        statement,
        query.page_num,
        query.page_size,
        (Feedback.create_time.desc(), Feedback.id.desc()),
    )
    response.headers["Cache-Control"] = "private, no-store"
    if not rows:
        return Result(message="未找到相关数据", data=PageResult(total=0, items=None))
    return Result(data=PageResult(total=total, items=[FeedbackView(**row) for row in rows]))


async def remove_feedback(session, ids):
    result = await session.execute(delete(Feedback).where(Feedback.id.in_(ids)))
    if not result.rowcount:
        raise BusinessError("删除失败")
    await session.commit()
    return Result(message="删除成功", data=None)


@router.delete("/deleteFeedback/{id}", response_model=Result[None])
async def delete_feedback(
    id: Annotated[int, Path(ge=-(2**63), le=2**63 - 1)], admin: Administrator, session: Session
):
    return await remove_feedback(session, [id])


@router.delete("/deleteFeedbacks", response_model=Result[None])
async def delete_feedbacks(ids: list[LegacyId], admin: Administrator, session: Session):
    return await remove_feedback(session, ids)
