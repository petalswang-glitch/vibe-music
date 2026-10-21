from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app.core.security import BusinessError, hash_password
from app.models import Feedback, User
from app.repositories import catalogue as repository
from app.schemas.admin_user import ManagedUser
from app.schemas.song import PageResult, Result


async def listing(session, query):
    statement = select(User)
    if query.username is not None:
        statement = statement.where(repository.contains(User.username, query.username))
    if query.phone is not None:
        statement = statement.where(repository.contains(User.phone, query.phone))
    if query.user_status is not None:
        statement = statement.where(User.status == query.user_status)
    # Use columns rather than entities to keep the response's allow-list explicit.
    statement = statement.with_only_columns(
        User.id.label("user_id"),
        User.username,
        User.phone,
        User.email,
        User.user_avatar,
        User.introduction,
        User.create_time,
        User.update_time,
        User.status,
    )
    total, rows = await repository.page(
        session,
        statement,
        query.page_num,
        query.page_size,
        (User.create_time.desc(), User.id.desc()),
    )
    if not rows:
        return Result(message="未找到相关数据", data=PageResult(total=0, items=None))
    values = [
        ManagedUser(
            **{k: v for k, v in row.items() if k != "status"},
            user_status="ENABLE" if row["status"] == 0 else "DISABLE",
        )
        for row in rows
    ]
    return Result(data=PageResult(total=total, items=values))


async def check_unique(session, body, *, exclude=None):
    for column, value, label in (
        (User.username, body.username, "用户名"),
        (User.phone, body.phone, "手机号"),
        (User.email, str(body.email), "邮箱"),
    ):
        if value is None:
            continue
        statement = select(User.id).where(column == value)
        if exclude is not None:
            statement = statement.where(User.id != exclude)
        if await session.scalar(statement):
            raise BusinessError(f"{label}已存在")


async def commit_unique(session):
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise BusinessError("用户名、手机号或邮箱已存在") from None


async def add(session, body):
    await check_unique(session, body)
    now = datetime.now()
    # Legacy addUser reverses its UI switch value: 1 means enabled here only.
    session.add(
        User(
            username=body.username,
            password=await hash_password(body.password),
            email=str(body.email),
            phone=body.phone,
            introduction=body.introduction,
            status=1 - body.user_status,
            create_time=now,
            update_time=now,
        )
    )
    await commit_unique(session)


async def locked_user(session, user_id):
    user = await session.scalar(
        select(User)
        .where(User.id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if user is None:
        raise BusinessError("更新失败")
    return user


async def edit(session, body):
    user = await locked_user(session, body.user_id)
    await check_unique(session, body, exclude=user.id)
    user.username, user.email = body.username, str(body.email)
    if "phone" in body.model_fields_set:
        user.phone = body.phone
    if "introduction" in body.model_fields_set:
        user.introduction = body.introduction
    user.update_time = datetime.now()
    await commit_unique(session)


async def change_status(session, user_id, status):
    if status not in (0, 1):
        raise BusinessError("用户状态无效")
    user = await locked_user(session, user_id)
    user.status, user.update_time = status, datetime.now()
    await session.commit()


async def remove(session, ids):
    # Lock parents before removing RESTRICT feedback. New child inserts must wait
    # until the account deletion commits; all changes share this transaction.
    try:
        existing = (
            await session.scalars(
                select(User.id).where(User.id.in_(ids)).order_by(User.id).with_for_update()
            )
        ).all()
        if not existing:
            raise BusinessError("删除失败")
        await session.execute(delete(Feedback).where(Feedback.user_id.in_(existing)))
        await session.execute(delete(User).where(User.id.in_(existing)))
        await session.commit()
    except Exception:
        await session.rollback()
        raise
