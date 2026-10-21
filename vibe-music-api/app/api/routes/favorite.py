from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.schemas.catalogue import PlaylistQuery, PlaylistView
from app.schemas.song import PageResult, Result, SongQuery, SongView
from app.services import favorite as service
from app.services.auth import authenticate, locked_user

router = APIRouter(prefix="/favorite", tags=["favorites"])
Session = Annotated[AsyncSession, Depends(get_session)]


@router.post("/getFavoriteSongs", response_model=Result[PageResult[SongView]])
async def favorite_songs(query: SongQuery, request: Request, response: Response, session: Session):
    user, _ = await authenticate(request, session)
    response.headers["Cache-Control"] = "private, no-store"
    return await service.songs(session, user.id, query)


@router.post("/getFavoritePlaylists", response_model=Result[PageResult[PlaylistView]])
async def favorite_playlists(
    query: PlaylistQuery, request: Request, response: Response, session: Session
):
    user, _ = await authenticate(request, session)
    response.headers["Cache-Control"] = "private, no-store"
    return await service.playlists(session, user.id, query)


async def mutate(request, session, target_id, kind, collect):
    user = await locked_user(request, session)
    await service.change(session, user.id, target_id, kind=kind, collect=collect)
    return {"code": 0, "message": "添加成功" if collect else "删除成功", "data": None}


@router.post("/collectSong")
async def collect_song(songId: int, request: Request, session: Session):
    return await mutate(request, session, songId, 0, True)


@router.delete("/cancelCollectSong")
async def cancel_song(songId: int, request: Request, session: Session):
    return await mutate(request, session, songId, 0, False)


@router.post("/collectPlaylist")
async def collect_playlist(playlistId: int, request: Request, session: Session):
    return await mutate(request, session, playlistId, 1, True)


@router.delete("/cancelCollectPlaylist")
async def cancel_playlist(playlistId: int, request: Request, session: Session):
    return await mutate(request, session, playlistId, 1, False)
