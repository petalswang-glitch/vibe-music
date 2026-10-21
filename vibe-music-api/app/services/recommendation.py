"""Legacy style recommendations, with a private 30-minute song candidate pool."""

import hashlib
import json
import logging
import random

from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Favorite, Genre, Playlist, Song
from app.repositories import catalogue as repository

logger = logging.getLogger(__name__)
POOL_TTL = 30 * 60
POOL_SIZE = 80


def pool_key(user_id: int, favorites: list[int], styles: list[int]) -> str:
    # An in-flight request may still write its old pool after a favorite changes.
    # Preference-addressed keys keep that write out of the new preference's cache.
    digest = hashlib.sha256(json.dumps([sorted(favorites), sorted(styles)]).encode()).hexdigest()
    return f"recommend:songs:v1:{user_id}:{digest}"


async def favorite_ids(session: AsyncSession, user_id: int, *, playlist=False) -> list[int]:
    column = Favorite.playlist_id if playlist else Favorite.song_id
    return list(
        await session.scalars(
            select(column)
            .where(Favorite.user_id == user_id, Favorite.type == int(playlist), column.is_not(None))
            .distinct()
        )
    )


def eligible_songs(favorites, styles):
    return (
        Song.id.not_in(favorites),
        Song.id.in_(select(Genre.song_id).where(Genre.style_id.in_(styles))),
    )


async def candidate_ids(session: AsyncSession, favorites, styles) -> list[int]:
    return list(
        await session.scalars(
            select(Song.id)
            .where(*eligible_songs(favorites, styles))
            .order_by(Song.release_time.desc(), Song.id.desc())
            .limit(POOL_SIZE)
        )
    )


async def cached_pool(session, redis: Redis | None, user_id, favorites, styles):
    key = pool_key(user_id, favorites, styles)
    ids = None
    if redis is not None:
        try:
            raw = await redis.get(key)
            if raw is not None:
                value = json.loads(raw)
                if (
                    isinstance(value, list)
                    and 0 < len(value) <= POOL_SIZE
                    and all(type(item) is int and 0 < item <= 2**63 - 1 for item in value)
                    and len(set(value)) == len(value)
                ):
                    ids = value
        except (RedisError, ValueError, TypeError, UnicodeDecodeError):
            logger.warning("Recommendation cache unavailable or malformed; using database")
    if ids is not None:
        # Hydrate current metadata; deleted songs and changed styles must not leak
        # through a cached DTO. Rebuild a stale pool instead of returning short data.
        rows = await repository.mappings(
            session,
            repository.song_selection().where(Song.id.in_(ids), *eligible_songs(favorites, styles)),
        )
        if len(rows) == len(ids):
            return rows
    ids = await candidate_ids(session, favorites, styles)
    if redis is not None and ids:
        try:
            await redis.set(key, json.dumps(ids), ex=POOL_TTL)
        except RedisError:
            logger.warning("Recommendation cache write failed; using database")
    return (
        await repository.mappings(session, repository.song_selection().where(Song.id.in_(ids)))
        if ids
        else []
    )


async def fill(session, rows, selection, id_field, limit):
    if len(rows) < limit:
        fallback = await repository.mappings(
            session, selection.order_by(func.random()).limit(limit)
        )
        chosen = {row[id_field] for row in rows}
        for row in fallback:
            if row[id_field] not in chosen:
                rows.append(row)
                chosen.add(row[id_field])
                if len(rows) == limit:
                    break
    return rows


async def songs(session: AsyncSession, user_id: int | None, redis: Redis | None):
    rows = []
    if user_id is not None:
        favorites = await favorite_ids(session, user_id)
        styles = (
            list(
                await session.scalars(
                    select(Genre.style_id).where(Genre.song_id.in_(favorites)).distinct()
                )
            )
            if favorites
            else []
        )
        if styles:
            pool = await cached_pool(session, redis, user_id, favorites, styles)
            rows = random.sample(pool, min(20, len(pool)))
    # The original random fallback may include favorites; only duplicates are excluded.
    return await fill(session, rows, repository.song_selection(), "song_id", 20)


async def playlists(session: AsyncSession, user_id: int | None):
    rows = []
    if user_id is not None:
        favorites = await favorite_ids(session, user_id, playlist=True)
        styles = (
            list(
                await session.scalars(
                    select(Playlist.style)
                    .where(Playlist.id.in_(favorites), Playlist.style.is_not(None))
                    .distinct()
                )
            )
            if favorites
            else []
        )
        if styles:
            # Approved correction: compare styles with styles, not playlist IDs.
            rows = await repository.mappings(
                session,
                repository.playlist_selection()
                .where(
                    Playlist.id.not_in(favorites),
                    or_(*(repository.equivalent(Playlist.style, style) for style in styles)),
                )
                .order_by(func.random())
                .limit(10),
            )
    return await fill(session, rows, repository.playlist_selection(), "playlist_id", 10)
