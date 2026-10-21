import io
import uuid

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from starlette.concurrency import run_in_threadpool

from app.core.security import BusinessError
from app.models import Artist, Song
from app.repositories import catalogue as repository
from app.schemas.admin_artist import ManagedArtist
from app.schemas.song import PageResult, Result
from app.services.admin_media import cleanup
from app.services.avatar import read_avatar, remove_avatar


async def listing(session, query):
    statement = repository.artist_selection(query).add_columns(
        Artist.gender, Artist.birth, Artist.area, Artist.introduction
    )
    total, rows = await repository.page(
        session, statement, query.page_num, query.page_size, Artist.id.desc()
    )
    if not rows:
        return Result(message="未找到相关数据", data=PageResult(total=0, items=None))
    return Result(data=PageResult(total=total, items=[ManagedArtist(**row) for row in rows]))


async def lock_names(session):
    # The original schema has no unique artist-name constraint. Serialize the
    # admin name checks within PostgreSQL, across API workers, until commit.
    await session.execute(select(func.pg_advisory_xact_lock(846203710)))


async def unique_name(session, name, exclude=None):
    statement = select(Artist.id).where(repository.equivalent(Artist.name, name))
    if exclude is not None:
        statement = statement.where(Artist.id != exclude)
    if await session.scalar(statement):
        raise BusinessError("歌手已存在")


async def add(session, body):
    await lock_names(session)
    await unique_name(session, body.artist_name)
    session.add(Artist(name=body.artist_name, **body.model_dump(exclude={"artist_name"})))
    await session.commit()


async def locked_artist(session, identity, message="更新失败"):
    row = await session.scalar(
        select(Artist)
        .where(Artist.id == identity)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if row is None:
        raise BusinessError(message)
    return row


async def edit(session, body):
    await lock_names(session)
    row = await locked_artist(session, body.artist_id)
    if body.artist_name is not None:
        await unique_name(session, body.artist_name, row.id)
        row.name = body.artist_name
    # MyBatis updateById skips null fields; empty area/introduction still clears.
    for field in ("gender", "birth", "area", "introduction"):
        value = getattr(body, field)
        if value is not None:
            setattr(row, field, value)
    await session.commit()


async def avatar(session, request, identity, upload):
    row = await locked_artist(session, identity)
    data = await read_avatar(upload)
    key = f"artists/{row.id}/{uuid.uuid4().hex}.png"
    previous = row.avatar_key
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
        raise HTTPException(502, "头像上传失败，请稍后重试") from None
    row.avatar, row.avatar_key = f"/media/{key}", key
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        await remove_avatar(request, key)
        raise
    await cleanup(session, request, [previous])


async def remove(session, request, ids, *, single=False):
    try:
        artists = (
            await session.scalars(
                select(Artist).where(Artist.id.in_(ids)).order_by(Artist.id).with_for_update()
            )
        ).all()
        if not artists:
            raise BusinessError("歌手NOT_FOUND" if single else "删除失败")
        existing = [row.id for row in artists]
        # Lock child songs so concurrent song edits cannot replace captured keys.
        songs = (
            await session.scalars(
                select(Song).where(Song.artist_id.in_(existing)).order_by(Song.id).with_for_update()
            )
        ).all()
        keys = [row.avatar_key for row in artists] + [
            key for row in songs for key in (row.cover_key, row.audio_key)
        ]
        await session.execute(delete(Artist).where(Artist.id.in_(existing)))
        # The retained foreign keys cascade songs, genres, bindings, favorites and comments.
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    await cleanup(session, request, keys)
