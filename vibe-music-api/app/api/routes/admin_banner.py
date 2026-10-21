from typing import Annotated

from fastapi import APIRouter, Path, Request, Response, UploadFile

from app.api.routes.admin import Administrator, Session
from app.schemas.admin import LegacyId
from app.schemas.admin_banner import BannerQuery, ManagedBanner
from app.schemas.song import PageResult, Result
from app.services import admin_banner as service

router = APIRouter(prefix="/admin", tags=["banner management"])
Id = Annotated[int, Path(ge=-(2**63), le=2**63 - 1)]


@router.post("/getAllBanners", response_model=Result[PageResult[ManagedBanner]])
async def listing(body: BannerQuery, admin: Administrator, session: Session, response: Response):
    response.headers["Cache-Control"] = "private, no-store"
    return await service.listing(session, body)


@router.post("/addBanner", response_model=Result[None])
async def add(banner: UploadFile, admin: Administrator, session: Session, request: Request):
    await service.upload(session, request, banner)
    return Result(message="添加成功", data=None)


@router.patch("/updateBanner/{id}", response_model=Result[None])
async def edit(
    id: Id, banner: UploadFile, admin: Administrator, session: Session, request: Request
):
    await service.upload(session, request, banner, id)
    return Result(message="更新成功", data=None)


@router.patch("/updateBannerStatus/{id}", response_model=Result[None])
async def status(id: Id, status: int, admin: Administrator, session: Session):
    await service.status(session, id, status)
    return Result(message="更新成功", data=None)


@router.delete("/deleteBanner/{id}", response_model=Result[None])
async def remove(id: Id, admin: Administrator, session: Session, request: Request):
    await service.remove(session, request, [id], single=True)
    return Result(message="删除成功", data=None)


@router.delete("/deleteBanners", response_model=Result[None])
async def remove_many(
    ids: list[LegacyId], admin: Administrator, session: Session, request: Request
):
    await service.remove(session, request, ids)
    return Result(message="删除成功", data=None)
