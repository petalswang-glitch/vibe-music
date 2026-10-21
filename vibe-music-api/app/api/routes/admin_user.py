from typing import Annotated

from fastapi import APIRouter, Path, Response
from sqlalchemy import func, select

from app.api.routes.admin import Administrator, Session
from app.models import User
from app.schemas.admin import LegacyId
from app.schemas.admin_user import ManagedUser, UserAdd, UserQuery, UserUpdate
from app.schemas.song import PageResult, Result
from app.services import admin_user as service

router = APIRouter(prefix="/admin", tags=["user management"])
Id = Annotated[int, Path(ge=-(2**63), le=2**63 - 1)]


@router.get("/getAllUsersCount", response_model=Result[int])
async def count(admin: Administrator, response: Response, session: Session):
    response.headers["Cache-Control"] = "private, no-store"
    return Result(data=await session.scalar(select(func.count()).select_from(User)))


@router.post("/getAllUsers", response_model=Result[PageResult[ManagedUser]])
async def listing(query: UserQuery, admin: Administrator, response: Response, session: Session):
    response.headers["Cache-Control"] = "private, no-store"
    return await service.listing(session, query)


@router.post("/addUser", response_model=Result[None])
async def add(body: UserAdd, admin: Administrator, session: Session):
    await service.add(session, body)
    return Result(message="添加成功", data=None)


@router.put("/updateUser", response_model=Result[None])
async def edit(body: UserUpdate, admin: Administrator, session: Session):
    await service.edit(session, body)
    return Result(message="更新成功", data=None)


@router.delete("/deleteUser/{id}", response_model=Result[None])
async def remove(id: Id, admin: Administrator, session: Session):
    await service.remove(session, [id])
    return Result(message="删除成功", data=None)


@router.delete("/deleteUsers", response_model=Result[None])
async def remove_many(ids: list[LegacyId], admin: Administrator, session: Session):
    await service.remove(session, ids)
    return Result(message="删除成功", data=None)


@router.patch("/updateUserStatus/{id}/{status}", response_model=Result[None])
async def change_status(
    id: Id,
    status: Annotated[int, Path(ge=-(2**31), le=2**31 - 1)],
    admin: Administrator,
    session: Session,
):
    await service.change_status(session, id, status)
    return Result(message="更新成功", data=None)
