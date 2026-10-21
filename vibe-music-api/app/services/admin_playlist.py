import io
import uuid

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from starlette.concurrency import run_in_threadpool

from app.core.security import BusinessError
from app.models import Playlist, PlaylistBinding, Song
from app.repositories import catalogue as repository
from app.schemas.admin_playlist import ManagedPlaylist
from app.schemas.song import PageResult, Result
from app.services.admin_media import cleanup
from app.services.avatar import read_avatar, remove_avatar


async def listing(session, query):
    statement = repository.playlist_selection(query).add_columns(
        Playlist.introduction, Playlist.style
    )
    total, rows = await repository.page(
        session, statement, query.page_num, query.page_size, Playlist.id.desc()
    )
    if not rows:
        return Result(message="未找到相关数据", data=PageResult(total=0, items=None))
    return Result(data=PageResult(total=total, items=[ManagedPlaylist(**row) for row in rows]))


async def unique_title(session, title, exclude=None):
    # The source table has no unique index; retain CI business uniqueness across workers.
    await session.execute(select(func.pg_advisory_xact_lock(846203711)))
    if title is None:
        return
    statement = select(Playlist.id).where(repository.equivalent(Playlist.title, title))
    if exclude is not None:
        statement = statement.where(Playlist.id != exclude)
    if await session.scalar(statement):
        raise BusinessError("歌单已存在")


async def add(session, body):
    await unique_title(session, body.title)
    session.add(Playlist(**body.model_dump()))
    await session.commit()


async def locked_playlist(session, identity, message="更新失败"):
    row = await session.scalar(
        select(Playlist)
        .where(Playlist.id == identity)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if row is None:
        raise BusinessError(message)
    return row


async def edit(session, body):
    await unique_title(session, body.title, body.playlist_id)
    row = await locked_playlist(session, body.playlist_id)
    for field in ("title", "introduction", "style"):
        value = getattr(body, field)
        if value is not None:
            setattr(row, field, value)
    await session.commit()


async def cover(session, request, identity, upload):
    row = await locked_playlist(session, identity)
    data = await read_avatar(upload)
    key = f"playlists/{row.id}/{uuid.uuid4().hex}.png"
    previous = row.cover_key
    try:
        await run_in_threadpool(
            request.app.state.media_store.put_object,
            request.app.state.settings.minio_bucket,
            key,
            io.BytesIO(data),
            len(data),
            content_type="image/png",
        )
    except Exception:
        raise HTTPException(502, "封面上传失败，请稍后重试") from None
    row.cover_key, row.cover_url = key, f"/media/{key}"
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        await remove_avatar(request, key)
        raise
    await cleanup(session, request, [previous])


async def remove(session, request, ids, *, single=False):
    try:
        rows = (
            await session.scalars(
                select(Playlist).where(Playlist.id.in_(ids)).order_by(Playlist.id).with_for_update()
            )
        ).all()
        if not rows:
            raise BusinessError("歌单NOT_FOUND" if single else "删除失败")
        keys = [row.cover_key for row in rows]
        await session.execute(delete(Playlist).where(Playlist.id.in_([row.id for row in rows])))
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    await cleanup(session, request, keys)


async def binding(session, playlist_id, song_id, *, remove=False):
    await locked_playlist(session, playlist_id, "歌单不存在")
    if (
        await session.scalar(
            select(Song.id).where(Song.id == song_id).with_for_update(read=True, key_share=True)
        )
        is None
    ):
        raise BusinessError("歌曲不存在")
    condition = (PlaylistBinding.playlist_id == playlist_id, PlaylistBinding.song_id == song_id)
    if remove:
        result = await session.execute(delete(PlaylistBinding).where(*condition))
        if not result.rowcount:
            raise BusinessError("歌曲不在该歌单中")
    else:
        if await session.scalar(select(PlaylistBinding.song_id).where(*condition)) is not None:
            raise BusinessError("歌曲已在该歌单中")
        session.add(PlaylistBinding(playlist_id=playlist_id, song_id=song_id))
    await session.commit()
