from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Artist, Playlist
from app.repositories import catalogue as repository
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
from app.services import recommendation


def page_result(total, rows, view):
    if not rows:
        return Result(message="未找到相关数据", data=PageResult(total=0, items=None))
    return Result(data=PageResult(total=total, items=[view(**row) for row in rows]))


async def artists(session: AsyncSession, query: ArtistQuery):
    total, rows = await repository.page(
        session,
        repository.artist_selection(query),
        query.page_num,
        query.page_size,
        Artist.id,
    )
    return page_result(total, rows, ArtistView)


async def playlists(session: AsyncSession, query: PlaylistQuery):
    total, rows = await repository.page(
        session,
        repository.playlist_selection(query),
        query.page_num,
        query.page_size,
        Playlist.id,
    )
    return page_result(total, rows, PlaylistView)


async def random_artists(session: AsyncSession):
    rows = await repository.mappings(
        session,
        repository.artist_selection(
            ArtistQuery(page_num=1, page_size=10),
        )
        .order_by(func.random())
        .limit(10),
    )
    if not rows:
        return Result(message="未找到相关数据", data=None)
    return Result(data=[ArtistView(**row) for row in rows])


async def recommended_songs(session: AsyncSession, user_id=None, redis=None):
    rows = await recommendation.songs(session, user_id, redis)
    return Result(data=[RecommendedSongView(**row) for row in rows])


async def recommended_playlists(session: AsyncSession, user_id=None):
    rows = await recommendation.playlists(session, user_id)
    return Result(data=[PlaylistView(**row) for row in rows])


async def artist_detail(session: AsyncSession, artist_id):
    data = await repository.artist_detail(session, artist_id)
    if data is None:
        # Fix the legacy missing-artist null dereference instead of reproducing a server error.
        return Result(message="未找到相关数据", data=None)
    return Result(data=ArtistDetailView(**data))


async def song_detail(session: AsyncSession, song_id):
    data = await repository.song_detail(session, song_id)
    return Result(data=SongDetailView(**data) if data is not None else None)


async def playlist_detail(session: AsyncSession, playlist_id):
    data = await repository.playlist_detail(session, playlist_id)
    if data is None:
        return Result(message="未找到相关数据", data=None)
    return Result(data=PlaylistDetailView(**data))


async def banners(session: AsyncSession):
    return Result(data=[BannerView(**row) for row in await repository.active_banners(session)])
