from typing import Annotated

from fastapi import APIRouter, Form, Path, Request, Response, UploadFile
from sqlalchemy import func, select

from app.api.routes.admin import Administrator, Session
from app.models import Song
from app.repositories.catalogue import contains
from app.schemas.admin import LegacyId
from app.schemas.admin_song import ManagedSong, SongAdd, SongSearch, SongUpdate
from app.schemas.song import PageResult, Result
from app.services import admin_song as service

router = APIRouter(prefix="/admin", tags=["song management"])
Id = Annotated[int, Path(ge=-(2**63), le=2**63 - 1)]


@router.get("/getAllSongsCount", response_model=Result[int])
async def count(
    admin: Administrator, session: Session, response: Response, style: str | None = None
):
    statement = select(func.count()).select_from(Song)
    if style is not None:
        statement = statement.where(contains(Song.style, style))
    response.headers["Cache-Control"] = "private, no-store"
    return Result(data=await session.scalar(statement))


@router.post("/getAllSongsByArtist", response_model=Result[PageResult[ManagedSong]])
async def listing(body: SongSearch, admin: Administrator, session: Session, response: Response):
    response.headers["Cache-Control"] = "private, no-store"
    return await service.listing(session, body)


@router.post("/addSong", response_model=Result[None])
async def add(body: SongAdd, admin: Administrator, session: Session):
    await service.add(session, body)
    return Result(message="添加成功", data=None)


@router.put("/updateSong", response_model=Result[None])
async def edit(body: SongUpdate, admin: Administrator, session: Session):
    await service.edit(session, body)
    return Result(message="更新成功", data=None)


@router.patch("/updateSongCover/{id}", response_model=Result[None])
async def cover(
    id: Id, cover: UploadFile, admin: Administrator, session: Session, request: Request
):
    await service.cover(session, request, id, cover)
    return Result(message="更新成功", data=None)


@router.patch("/updateSongAudio/{id}", response_model=Result[None])
async def audio(
    id: Id,
    audio: UploadFile,
    duration: Annotated[str, Form(min_length=1, max_length=10, pattern=r"^\d+(?:\.\d+)?$")],
    admin: Administrator,
    session: Session,
    request: Request,
):
    if float(duration) <= 0:
        from app.core.security import BusinessError

        raise BusinessError("音频时长无效")
    await service.audio(session, request, id, audio, duration)
    return Result(message="更新成功", data=None)


@router.delete("/deleteSong/{id}", response_model=Result[None])
async def remove(id: Id, admin: Administrator, session: Session, request: Request):
    await service.remove(session, request, [id], single=True)
    return Result(message="删除成功", data=None)


@router.delete("/deleteSongs", response_model=Result[None])
async def remove_many(
    ids: list[LegacyId], admin: Administrator, session: Session, request: Request
):
    await service.remove(session, request, ids)
    return Result(message="删除成功", data=None)
