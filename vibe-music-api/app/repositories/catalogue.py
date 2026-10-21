from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Artist, Banner, Comment, Playlist, PlaylistBinding, Song, User
from app.schemas.catalogue import ArtistQuery, PlaylistQuery


def contains(column, value):
    # PG16 LIKE cannot operate directly on nondeterministic collations.
    return func.public.unaccent(column.collate("C")).ilike(func.public.unaccent(f"%{value}%"))


def equivalent(column, value):
    # Equality supports nondeterministic ICU collations (unlike PG16 LIKE).
    # C-locale lower() would fail to fold e.g. Cyrillic/Greek uppercase letters.
    return column.collate("legacy_ci") == value


def song_selection():
    return select(
        Song.id.label("song_id"),
        Song.name.label("song_name"),
        Artist.name.label("artist_name"),
        Song.album,
        Song.duration,
        Song.cover_url,
        Song.audio_url,
        Song.release_time,
    ).outerjoin(Artist, Song.artist_id == Artist.id)


def artist_selection(query: ArtistQuery):
    statement = select(
        Artist.id.label("artist_id"),
        Artist.name.label("artist_name"),
        Artist.avatar,
    )
    if query.artist_name is not None:
        statement = statement.where(contains(Artist.name, query.artist_name))
    if query.gender is not None:
        statement = statement.where(Artist.gender == query.gender)
    if query.area is not None:
        statement = statement.where(contains(Artist.area, query.area))
    return statement


def playlist_selection(query: PlaylistQuery | None = None):
    statement = select(
        Playlist.id.label("playlist_id"),
        Playlist.title,
        Playlist.cover_url,
    )
    if query is not None:
        if query.title is not None:
            statement = statement.where(contains(Playlist.title, query.title))
        if query.style is not None:
            # The original public list uses equality, unlike the favorite list's LIKE.
            statement = statement.where(equivalent(Playlist.style, query.style))
    return statement


async def page(session: AsyncSession, statement, page_num, page_size, ordering):
    total = int(await session.scalar(select(func.count()).select_from(statement.subquery())) or 0)
    rows = await session.execute(
        statement.order_by(*(ordering if isinstance(ordering, tuple) else (ordering,)))
        .offset((page_num - 1) * page_size)
        .limit(page_size)
    )
    return total, [dict(row) for row in rows.mappings()]


async def mappings(session: AsyncSession, statement):
    result = await session.execute(statement)
    return [dict(row) for row in result.mappings()]


async def comments(session: AsyncSession, *, song_id=None, playlist_id=None):
    condition = (
        (Comment.type == 0) & (Comment.song_id == song_id)
        if song_id is not None
        else ((Comment.type == 1) & (Comment.playlist_id == playlist_id))
    )
    return await mappings(
        session,
        select(
            Comment.id.label("comment_id"),
            User.username,
            User.user_avatar,
            Comment.content,
            cast(Comment.create_time, Date).label("create_time"),
            Comment.like_count,
        )
        .outerjoin(User, Comment.user_id == User.id)
        .where(condition)
        .order_by(Comment.id),
    )


async def artist_detail(session: AsyncSession, artist_id):
    result = await session.execute(
        select(
            Artist.id.label("artist_id"),
            Artist.name.label("artist_name"),
            Artist.avatar,
            Artist.gender,
            Artist.birth,
            Artist.area,
            Artist.introduction,
        ).where(Artist.id == artist_id)
    )
    row = result.mappings().first()
    if row is None:
        return None
    songs = await mappings(
        session, song_selection().where(Song.artist_id == artist_id).order_by(Song.id)
    )
    return {**dict(row), "songs": songs}


async def song_detail(session: AsyncSession, song_id):
    result = await session.execute(
        song_selection().add_columns(Song.lyric).where(Song.id == song_id)
    )
    row = result.mappings().first()
    if row is None:
        return None
    return {**dict(row), "comments": await comments(session, song_id=song_id)}


async def playlist_detail(session: AsyncSession, playlist_id):
    result = await session.execute(
        playlist_selection().add_columns(Playlist.introduction).where(Playlist.id == playlist_id)
    )
    row = result.mappings().first()
    if row is None:
        return None
    songs = await mappings(
        session,
        song_selection()
        .join(
            PlaylistBinding,
            PlaylistBinding.song_id == Song.id,
        )
        .where(PlaylistBinding.playlist_id == playlist_id)
        .order_by(Song.id),
    )
    return {
        **dict(row),
        "songs": songs,
        "comments": await comments(session, playlist_id=playlist_id),
    }


async def active_banners(session: AsyncSession):
    return await mappings(
        session,
        select(
            Banner.id.label("banner_id"),
            Banner.banner_url,
        )
        .where(Banner.status == 0)
        .order_by(Banner.id.desc())
        .limit(9),
    )
