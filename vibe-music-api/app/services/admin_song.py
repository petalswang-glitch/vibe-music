import io
import uuid

from fastapi import HTTPException
from mutagen import MutagenError
from mutagen.mp3 import MP3
from sqlalchemy import delete, select
from starlette.concurrency import run_in_threadpool

from app.core.security import BusinessError
from app.models import Artist, Genre, Song, Style
from app.repositories import catalogue as repository
from app.schemas.admin_song import ManagedSong
from app.schemas.song import PageResult, Result
from app.services.admin_media import cleanup
from app.services.avatar import read_avatar, remove_avatar

MAX_AUDIO_BYTES = 100 * 1024 * 1024


async def listing(session, query):
    statement = repository.song_selection().add_columns(Song.lyric, Song.style)
    if query.artist_id is not None:
        statement = statement.where(Song.artist_id == query.artist_id)
    for column, value in ((Song.name, query.song_name), (Song.album, query.album)):
        if value is not None:
            statement = statement.where(repository.contains(column, value))
    total, rows = await repository.page(
        session,
        statement,
        query.page_num,
        query.page_size,
        (Song.release_time.desc(), Song.id.desc()),
    )
    if not rows:
        return Result(message="未找到相关数据", data=PageResult(total=0, items=None))
    return Result(data=PageResult(total=total, items=[ManagedSong(**row) for row in rows]))


async def artist_exists(session, identity):
    if identity is None or identity <= 0:
        raise BusinessError("请选择歌手")
    # Acquire the parent before a song row; artist deletion takes parent then children.
    if (
        await session.scalar(
            select(Artist.id)
            .where(Artist.id == identity)
            .with_for_update(read=True, key_share=True)
        )
        is None
    ):
        raise BusinessError("请选择歌手")


async def genres(session, identity, value):
    await session.execute(delete(Genre).where(Genre.song_id == identity))
    names = value.split(",") if value else []
    if names:
        ids = await session.scalars(select(Style.id).where(Style.name.in_(names)))
        session.add_all([Genre(song_id=identity, style_id=style_id) for style_id in ids])


async def add(session, body):
    await artist_exists(session, body.artist_id)
    row = Song(
        artist_id=body.artist_id,
        name=body.song_name,
        album=body.album,
        style=body.style,
        release_time=body.release_time,
    )
    session.add(row)
    await session.flush()
    await genres(session, row.id, body.style)
    await session.commit()


async def locked_song(session, identity):
    row = await session.scalar(
        select(Song)
        .where(Song.id == identity)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if row is None:
        raise BusinessError("歌曲NOT_FOUND")
    return row


async def edit(session, body):
    if body.artist_id is not None:
        await artist_exists(session, body.artist_id)
    row = await locked_song(session, body.song_id)
    for field, target in (
        ("artist_id", "artist_id"),
        ("song_name", "name"),
        ("album", "album"),
        ("style", "style"),
        ("release_time", "release_time"),
    ):
        value = getattr(body, field)
        if value is not None:
            setattr(row, target, value)
    # Original updateSong clears/rebuilds mappings even when style is omitted.
    await genres(session, row.id, body.style)
    await session.commit()


async def store_file(session, request, row, stream, size, *, audio=False, duration=None):
    folder, extension = ("songs", "mp3") if audio else ("songCovers", "png")
    key = f"{folder}/{row.id}/{uuid.uuid4().hex}.{extension}"
    old = row.audio_key if audio else row.cover_key
    try:
        await run_in_threadpool(
            request.app.state.media_store.put_object,
            request.app.state.settings.minio_bucket,
            key,
            stream,
            size,
            content_type="audio/mpeg" if audio else "image/png",
        )
    except Exception:
        raise HTTPException(502, "媒体上传失败，请稍后重试") from None
    if audio:
        row.audio_key, row.audio_url, row.duration = key, f"/media/{key}", duration
    else:
        row.cover_key, row.cover_url = key, f"/media/{key}"
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        await remove_avatar(request, key)
        raise
    await cleanup(session, request, [old])


async def cover(session, request, identity, upload):
    row = await locked_song(session, identity)
    data = await read_avatar(upload)
    await store_file(session, request, row, io.BytesIO(data), len(data))


def valid_mp3(stream):
    try:
        info = MP3(stream).info
        if info.layer != 3 or info.length <= 0:
            raise BusinessError("请选择有效的MP3音频文件")
    except (MutagenError, ValueError, OSError):
        raise BusinessError("请选择有效的MP3音频文件") from None


async def audio(session, request, identity, upload, duration):
    try:
        row = await locked_song(session, identity)
        if not (upload.filename or "").lower().endswith(".mp3"):
            raise BusinessError("只能上传.mp3格式的音频文件")
        size = 0
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_AUDIO_BYTES:
                raise HTTPException(413, "音频文件不能超过100MB")
        await upload.seek(0)
        await run_in_threadpool(valid_mp3, upload.file)
        await upload.seek(0)
        await store_file(session, request, row, upload.file, size, audio=True, duration=duration)
    finally:
        await upload.close()


async def remove(session, request, ids, *, single=False):
    try:
        rows = (
            await session.scalars(
                select(Song).where(Song.id.in_(ids)).order_by(Song.id).with_for_update()
            )
        ).all()
        if not rows:
            raise BusinessError("歌曲NOT_FOUND" if single else "删除失败")
        keys = [key for row in rows for key in (row.cover_key, row.audio_key)]
        await session.execute(delete(Song).where(Song.id.in_([row.id for row in rows])))
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    await cleanup(session, request, keys)
