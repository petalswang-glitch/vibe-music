from datetime import datetime

from sqlalchemy import delete, func, literal, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import BusinessError
from app.models import Artist, Favorite, Playlist, Song
from app.repositories.catalogue import contains, page, playlist_selection, song_selection
from app.schemas.catalogue import PlaylistQuery, PlaylistView
from app.schemas.song import PageResult, Result, SongQuery, SongView


async def change(session: AsyncSession, user_id: int, target_id: int, *, kind: int, collect: bool):
    column = Favorite.song_id if kind == 0 else Favorite.playlist_id
    condition = (Favorite.user_id == user_id) & (Favorite.type == kind) & (column == target_id)
    if not collect:
        removed = await session.execute(delete(Favorite).where(condition))
        if not removed.rowcount:
            raise BusinessError("删除失败")
    else:
        if await session.scalar(select(Favorite.id).where(condition).limit(1)):
            raise BusinessError("添加失败")
        model = Song if kind == 0 else Playlist
        if await session.get(model, target_id) is None:
            raise BusinessError("添加失败")
        session.add(
            Favorite(
                user_id=user_id,
                type=kind,
                song_id=target_id if kind == 0 else None,
                playlist_id=target_id if kind == 1 else None,
                create_time=datetime.now(),
            )
        )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise BusinessError("添加失败" if collect else "删除失败") from None


def owned_selection(user_id: int, kind: int):
    column = Favorite.song_id if kind == 0 else Favorite.playlist_id
    # Restrict the join to this user and deduplicate legacy rows. The old song
    # mapper joined every user's favorites and could multiply records/counts.
    return (
        select(column.label("target_id"), func.max(Favorite.create_time).label("collected_at"))
        .where(Favorite.user_id == user_id, Favorite.type == kind)
        .group_by(column)
        .subquery()
    )


async def songs(session: AsyncSession, user_id: int, query: SongQuery):
    owned = owned_selection(user_id, 0)
    statement = (
        song_selection()
        .add_columns(literal(1).label("like_status"))
        .join(owned, owned.c.target_id == Song.id)
    )
    for column, value in (
        (Song.name, query.song_name),
        (Artist.name, query.artist_name),
        (Song.album, query.album),
    ):
        if value is not None and value.strip():
            statement = statement.where(contains(column, value))
    total, rows = await page(
        session,
        statement,
        query.page_num,
        query.page_size,
        (owned.c.collected_at.desc(), Song.id.desc()),
    )
    return Result(data=PageResult(total=total, items=[SongView(**row) for row in rows]))


async def playlists(session: AsyncSession, user_id: int, query: PlaylistQuery):
    owned = owned_selection(user_id, 1)
    statement = playlist_selection().join(owned, owned.c.target_id == Playlist.id)
    for column, value in ((Playlist.title, query.title), (Playlist.style, query.style)):
        if value is not None and value.strip():
            statement = statement.where(contains(column, value))
    total, rows = await page(
        session,
        statement,
        query.page_num,
        query.page_size,
        (owned.c.collected_at.desc(), Playlist.id.desc()),
    )
    return Result(data=PageResult(total=total, items=[PlaylistView(**row) for row in rows]))


async def mark_songs(session: AsyncSession, user_id: int | None, songs):
    if user_id is None or not songs:
        return
    ids = {song.song_id for song in songs}
    liked = set(
        await session.scalars(
            select(Favorite.song_id).where(
                Favorite.user_id == user_id, Favorite.type == 0, Favorite.song_id.in_(ids)
            )
        )
    )
    for song in songs:
        if song.song_id in liked:
            song.like_status = 1


async def playlist_liked(session: AsyncSession, user_id: int | None, playlist_id: int) -> int:
    if user_id is None:
        return 0
    return int(
        bool(
            await session.scalar(
                select(Favorite.id)
                .where(
                    Favorite.user_id == user_id,
                    Favorite.type == 1,
                    Favorite.playlist_id == playlist_id,
                )
                .limit(1)
            )
        )
    )
