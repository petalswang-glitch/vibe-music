import io
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.limits import login_limits, mail_limits
from app.core.security import BusinessError, hash_password, verify_password
from app.db.session import get_session
from app.models import Feedback, User
from app.schemas.account import (
    ChangePasswordInput,
    Email,
    LoginInput,
    ProfileInput,
    RegisterInput,
    ResetPasswordInput,
)
from app.services.auth import (
    authenticate,
    consume_code,
    issue_token,
    locked_user,
    send_code,
    session_key,
)
from app.services.avatar import read_avatar, remove_avatar

router = APIRouter(prefix="/user", tags=["account"])
Session = Annotated[AsyncSession, Depends(get_session)]


def result(message="操作成功", data=None):
    return {"code": 0, "message": message, "data": data}


async def by_email(session: AsyncSession, email: str, *, lock=False):
    # Uniqueness keeps legacy CI collation; authentication must not conflate
    # distinct accented mailboxes when validating an emailed reset code.
    query = select(User).where(func.lower(User.email).collate("C") == email.lower())
    return await session.scalar(query.with_for_update() if lock else query)


@router.put("/updateUserInfo")
async def update_profile(body: ProfileInput, request: Request, session: Session):
    user = await locked_user(request, session)
    if body.user_id is not None and body.user_id != user.id:
        raise HTTPException(403, "您没有权限修改其他用户的信息")
    for column, value, label in (
        (User.username, body.username, "用户名"),
        (User.phone, body.phone, "手机号"),
        (User.email, str(body.email), "邮箱"),
    ):
        if value is not None and await session.scalar(
            select(User.id).where(column == value, User.id != user.id)
        ):
            raise BusinessError(f"{label}已存在")
    user.username, user.email = body.username, str(body.email)
    if "phone" in body.model_fields_set:
        user.phone = body.phone
    if "introduction" in body.model_fields_set:
        user.introduction = body.introduction
    user.update_time = datetime.now()
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise BusinessError("用户名、手机号或邮箱已存在") from None
    return result("更新成功")


@router.patch("/updateUserAvatar")
async def update_avatar(request: Request, session: Session, avatar: UploadFile):
    user = await locked_user(request, session)
    data = await read_avatar(avatar)
    key = f"users/{user.id}/{uuid.uuid4().hex}.png"
    previous = user.avatar_key
    try:
        await run_in_threadpool(
            request.app.state.media_store.put_object,
            request.app.state.settings.minio_bucket,
            key,
            io.BytesIO(data),
            len(data),
            content_type="image/png",
        )
    except Exception:
        raise HTTPException(502, "头像上传失败，请稍后重试") from None
    user.user_avatar, user.avatar_key = f"/media/{key}", key
    user.update_time = datetime.now()
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        await remove_avatar(request, key)
        raise
    await remove_avatar(request, previous)
    return result("更新成功")


@router.delete("/deleteAccount")
async def delete_account(request: Request, session: Session):
    user = await locked_user(request, session)
    previous = user.avatar_key
    # Feedback is RESTRICT; comments and favorites retain their original CASCADE.
    await session.execute(delete(Feedback).where(Feedback.user_id == user.id))
    await session.delete(user)
    await session.commit()
    await remove_avatar(request, previous)
    return result("删除成功")


@router.get("/sendVerificationCode")
async def verification_code(request: Request, email: Email):
    await mail_limits(request)
    await send_code(request, str(email))
    return result("邮件发送成功")


@router.post("/register")
async def register(body: RegisterInput, request: Request, session: Session):
    await consume_code(request, str(body.email), body.verification_code)
    if await session.scalar(select(User.id).where(User.username == body.username)):
        raise BusinessError("用户名已存在")
    if await session.scalar(select(User.id).where(User.email == str(body.email))):
        raise BusinessError("邮箱已存在")
    now = datetime.now()
    user = User(
        username=body.username,
        email=str(body.email),
        password=await hash_password(body.password),
        status=0,
        create_time=now,
        update_time=now,
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise BusinessError("用户名或邮箱已存在") from None
    return result("注册成功")


@router.post("/login")
async def login(body: LoginInput, request: Request, session: Session):
    await login_limits(request, "user", str(body.email))
    user = await by_email(session, str(body.email), lock=True)
    if user is None:
        raise BusinessError("邮箱错误")
    if user.status != 0:
        raise BusinessError("账号被锁定")
    valid, upgrade = await verify_password(body.password, user.password)
    if not valid:
        raise BusinessError("密码错误")
    if upgrade:
        user.password = await hash_password(body.password)
        user.update_time = datetime.now()
    await session.commit()
    return result("登录成功", await issue_token(request, user))


@router.get("/getUserInfo")
async def user_info(request: Request, session: Session):
    user, _ = await authenticate(request, session)
    return result(
        data={
            "userId": user.id,
            "username": user.username,
            "phone": user.phone,
            "email": user.email,
            "userAvatar": user.user_avatar,
            "introduction": user.introduction,
        }
    )


@router.post("/logout")
async def logout(request: Request, session: Session):
    user, jti = await authenticate(request, session)
    await request.app.state.redis.delete(session_key(user.id, jti))
    return result("登出成功")


@router.patch("/resetUserPassword")
async def reset_password(body: ResetPasswordInput, request: Request, session: Session):
    await consume_code(request, str(body.email), body.verification_code)
    user = await by_email(session, str(body.email), lock=True)
    if user is None:
        raise BusinessError("邮箱不存在")
    if body.new_password != body.repeat_password:
        raise BusinessError("两次填写的新密码不一样")
    user.password = await hash_password(body.new_password)
    user.update_time = datetime.now()
    await session.commit()
    # Sessions carry the password fingerprint, so old sessions are rejected
    # immediately. Do not scan/delete: that can revoke a concurrent new login.
    return result("密码重置成功")


@router.patch("/updateUserPassword")
async def change_password(body: ChangePasswordInput, request: Request, session: Session):
    identity, _ = await authenticate(request, session)
    # Re-read under a row lock: another password reset may have committed since authentication.
    user = await session.scalar(
        select(User)
        .where(User.id == identity.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    valid, _ = await verify_password(body.old_password, user.password)
    if not valid:
        raise BusinessError("原密码填写不正确")
    same, _ = await verify_password(body.new_password, user.password)
    if same:
        raise BusinessError("新密码不能与原密码相同")
    if body.new_password != body.repeat_password:
        raise BusinessError("两次填写的新密码不一样")
    user.password = await hash_password(body.new_password)
    user.update_time = datetime.now()
    await session.commit()
    return result("更新成功")
