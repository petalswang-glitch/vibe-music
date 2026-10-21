from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, Response, UploadFile
from sqlalchemy import func, select

from app.api.routes.admin import Administrator, Session
from app.models import Playlist
from app.repositories.catalogue import equivalent
from app.schemas.admin import LegacyId
from app.schemas.admin_playlist import ManagedPlaylist, PlaylistAdd, PlaylistSearch, PlaylistUpdate
from app.schemas.song import PageResult, Result
from app.services import admin_playlist as service

router = APIRouter(tags=["playlist management"])
Id = Annotated[int, Path(ge=-(2**63), le=2**63 - 1)]
QueryId = Annotated[int, Query(ge=-(2**63), le=2**63 - 1)]


@router.get("/admin/getAllPlaylistsCount", response_model=Result[int])
async def count(
    admin: Administrator, session: Session, response: Response, style: str | None = None
):
    statement = select(func.count()).select_from(Playlist)
    if style is not None:
        statement = statement.where(equivalent(Playlist.style, style))
    response.headers["Cache-Control"] = "private, no-store"
    return Result(data=await session.scalar(statement))


@router.post("/admin/getAllPlaylists", response_model=Result[PageResult[ManagedPlaylist]])
async def listing(body: PlaylistSearch, admin: Administrator, session: Session, response: Response):
    response.headers["Cache-Control"] = "private, no-store"
    return await service.listing(session, body)


@router.post("/admin/addPlaylist", response_model=Result[None])
async def add(body: PlaylistAdd, admin: Administrator, session: Session):
    await service.add(session, body)
    return Result(message="添加成功", data=None)


@router.put("/admin/updatePlaylist", response_model=Result[None])
async def edit(body: PlaylistUpdate, admin: Administrator, session: Session):
    await service.edit(session, body)
    return Result(message="更新成功", data=None)


@router.patch("/admin/updatePlaylistCover/{id}", response_model=Result[None])
async def cover(
    id: Id, cover: UploadFile, admin: Administrator, session: Session, request: Request
):
    await service.cover(session, request, id, cover)
    return Result(message="更新成功", data=None)


@router.delete("/admin/deletePlaylist/{id}", response_model=Result[None])
async def remove(id: Id, admin: Administrator, session: Session, request: Request):
    await service.remove(session, request, [id], single=True)
    return Result(message="删除成功", data=None)


@router.delete("/admin/deletePlaylists", response_model=Result[None])
async def remove_many(
    ids: list[LegacyId], admin: Administrator, session: Session, request: Request
):
    await service.remove(session, request, ids)
    return Result(message="删除成功", data=None)


@router.post("/playlist-binding/addSong", response_model=Result[None])
async def bind(playlistId: QueryId, songId: QueryId, admin: Administrator, session: Session):
    await service.binding(session, playlistId, songId)
    return Result(message="添加成功", data=None)


@router.delete("/playlist-binding/removeSong", response_model=Result[None])
async def unbind(playlistId: QueryId, songId: QueryId, admin: Administrator, session: Session):
    await service.binding(session, playlistId, songId, remove=True)
    return Result(message="删除成功", data=None)
