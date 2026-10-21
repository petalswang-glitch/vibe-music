"""The four original VibeAgent catalogue queries, independent of the model runtime."""

from sqlalchemy import func, or_, select

from app.models import Artist, Song, Style
from app.repositories.catalogue import contains, song_selection
from app.schemas.catalogue import RecommendedSongView


async def _songs(session, statement):
    rows = (await session.execute(statement)).mappings().all()
    # Original tools return SongVO, with a nullable (not personalized) likeStatus.
    return [RecommendedSongView(**row).model_dump(mode="json", by_alias=True) for row in rows]


async def search_songs(session, keyword: str | None):
    if keyword is None or keyword == "":
        return []
    statement = (
        song_selection()
        .where(
            or_(
                contains(Song.name, keyword),
                contains(Artist.name, keyword),
                contains(Song.album, keyword),
            )
        )
        .order_by(Song.release_time.desc(), Song.id.desc())
        .limit(10)
    )
    return await _songs(session, statement)


async def recommend_songs_by_style(session, style: str | None):
    if style is None:
        return []
    # Source tool filters the display string, not Genre IDs or a user's favorites.
    statement = song_selection().where(contains(Song.style, style)).order_by(Song.id).limit(10)
    return await _songs(session, statement)


async def get_hot_songs(session):
    # "Hot" is the original tool name; the source uses random songs, not play counts.
    return await _songs(session, song_selection().order_by(func.random()).limit(20))


async def list_styles(session):
    return list(await session.scalars(select(Style.name).order_by(Style.id)))
