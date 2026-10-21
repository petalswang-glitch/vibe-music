from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, Response, UploadFile
from sqlalchemy import func, select

from app.api.routes.admin import Administrator, Session
from app.models import Artist
from app.repositories.catalogue import equivalent
from app.schemas.admin import LegacyId
from app.schemas.admin_artist import (
    ArtistFields,
    ArtistName,
    ArtistSearch,
    ArtistUpdate,
    ManagedArtist,
)
from app.schemas.song import PageResult, Result
from app.services import admin_artist as service

router = APIRouter(prefix="/admin", tags=["artist management"])
Id = Annotated[int, Path(ge=-(2**63), le=2**63 - 1)]


@router.get("/getAllArtistsCount", response_model=Result[int])
async def count(
    admin: Administrator,
    session: Session,
    response: Response,
    gender: Annotated[int | None, Query(ge=-(2**31), le=2**31 - 1)] = None,
    area: str | None = None,
):
    statement = select(func.count()).select_from(Artist)
    if gender is not None:
        statement = statement.where(Artist.gender == gender)
    if area is not None:
        statement = statement.where(equivalent(Artist.area, area))
    response.headers["Cache-Control"] = "private, no-store"
    return Result(data=await session.scalar(statement))


@router.post("/getAllArtists", response_model=Result[PageResult[ManagedArtist]])
async def listing(body: ArtistSearch, admin: Administrator, session: Session, response: Response):
    response.headers["Cache-Control"] = "private, no-store"
    return await service.listing(session, body)


@router.get("/getAllArtistNames", response_model=Result[list[ArtistName] | None])
async def names(admin: Administrator, session: Session, response: Response):
    rows = (
        (
            await session.execute(
                select(Artist.id.label("artist_id"), Artist.name.label("artist_name")).order_by(
                    Artist.id.desc()
                )
            )
        )
        .mappings()
        .all()
    )
    response.headers["Cache-Control"] = "private, no-store"
    return (
        Result(data=[ArtistName(**row) for row in rows])
        if rows
        else Result(message="未找到相关数据", data=None)
    )


@router.post("/addArtist", response_model=Result[None])
async def add(body: ArtistFields, admin: Administrator, session: Session):
    await service.add(session, body)
    return Result(message="添加成功", data=None)


@router.put("/updateArtist", response_model=Result[None])
async def edit(body: ArtistUpdate, admin: Administrator, session: Session):
    await service.edit(session, body)
    return Result(message="更新成功", data=None)


@router.patch("/updateArtistAvatar/{id}", response_model=Result[None])
async def avatar(
    id: Id, avatar: UploadFile, admin: Administrator, session: Session, request: Request
):
    await service.avatar(session, request, id, avatar)
    return Result(message="更新成功", data=None)


@router.delete("/deleteArtist/{id}", response_model=Result[None])
async def remove(id: Id, admin: Administrator, session: Session, request: Request):
    await service.remove(session, request, [id], single=True)
    return Result(message="删除成功", data=None)


@router.delete("/deleteArtists", response_model=Result[None])
async def remove_many(
    ids: list[LegacyId], admin: Administrator, session: Session, request: Request
):
    await service.remove(session, request, ids)
    return Result(message="删除成功", data=None)
