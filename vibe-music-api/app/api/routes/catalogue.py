from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.schemas.catalogue import (
    ArtistDetailView,
    ArtistQuery,
    ArtistView,
    BannerView,
    PlaylistDetailView,
    PlaylistQuery,
    PlaylistView,
    RecommendedSongView,
    SongDetailView,
)
from app.schemas.song import PageResult, Result
from app.services import catalogue as service
from app.services.auth import optional_user_id
from app.services.favorite import mark_songs, playlist_liked

router = APIRouter(tags=["catalogue"])
Session = Annotated[AsyncSession, Depends(get_session)]


@router.post("/artist/getAllArtists", response_model=Result[PageResult[ArtistView]])
async def artists(query: ArtistQuery, session: Session):
    return await service.artists(session, query)


@router.get("/artist/getRandomArtists", response_model=Result[list[ArtistView] | None])
async def random_artists(session: Session):
    return await service.random_artists(session)


@router.get("/artist/getArtistDetail/{id}", response_model=Result[ArtistDetailView | None])
async def artist_detail(id: int, request: Request, response: Response, session: Session):
    user_id = await optional_user_id(request, session)
    result = await service.artist_detail(session, id)
    if result.data:
        await mark_songs(session, user_id, result.data.songs)
    response.headers["Cache-Control"] = "private, no-store"
    return result


@router.post("/playlist/getAllPlaylists", response_model=Result[PageResult[PlaylistView]])
async def playlists(query: PlaylistQuery, session: Session):
    return await service.playlists(session, query)


@router.get("/playlist/getRecommendedPlaylists", response_model=Result[list[PlaylistView]])
async def recommended_playlists(request: Request, response: Response, session: Session):
    user_id = await optional_user_id(request, session)
    response.headers["Cache-Control"] = "private, no-store"
    return await service.recommended_playlists(session, user_id)


@router.get("/playlist/getPlaylistDetail/{id}", response_model=Result[PlaylistDetailView | None])
async def playlist_detail(id: int, request: Request, response: Response, session: Session):
    user_id = await optional_user_id(request, session)
    result = await service.playlist_detail(session, id)
    if result.data:
        await mark_songs(session, user_id, result.data.songs)
        result.data.like_status = await playlist_liked(session, user_id, id)
    response.headers["Cache-Control"] = "private, no-store"
    return result


@router.get("/song/getRecommendedSongs", response_model=Result[list[RecommendedSongView]])
async def recommended_songs(request: Request, response: Response, session: Session):
    user_id = await optional_user_id(request, session)
    result = await service.recommended_songs(
        session, user_id, getattr(request.app.state, "redis", None)
    )
    await mark_songs(session, user_id, result.data)
    response.headers["Cache-Control"] = "private, no-store"
    return result


@router.get("/song/getSongDetail/{id}", response_model=Result[SongDetailView | None])
async def song_detail(id: int, request: Request, response: Response, session: Session):
    user_id = await optional_user_id(request, session)
    result = await service.song_detail(session, id)
    if result.data:
        await mark_songs(session, user_id, [result.data])
    response.headers["Cache-Control"] = "private, no-store"
    return result


@router.get("/banner/getBannerList", response_model=Result[list[BannerView]])
async def banners(session: Session):
    return await service.banners(session)
