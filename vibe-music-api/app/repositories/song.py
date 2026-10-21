from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Artist, Song
from app.schemas.song import SongQuery


async def find_songs(session: AsyncSession, query: SongQuery) -> tuple[int, list[dict]]:
    filters = []
    for column, value in (
        (Song.name, query.song_name),
        (Artist.name, query.artist_name),
        (Song.album, query.album),
    ):
        if value is not None:
            # Preserve legacy case/accent-insensitive substring search and LIKE wildcards.
            filters.append(func.public.unaccent(column).ilike(func.public.unaccent(f"%{value}%")))

    joined = select(Song).outerjoin(Artist, Song.artist_id == Artist.id).where(*filters)
    total = await session.scalar(select(func.count()).select_from(joined.subquery()))
    rows = await session.execute(
        select(
            Song.id.label("song_id"),
            Song.name.label("song_name"),
            Artist.name.label("artist_name"),
            Song.album,
            Song.duration,
            Song.cover_url,
            Song.audio_url,
            Song.release_time,
        )
        .outerjoin(Artist, Song.artist_id == Artist.id)
        .where(*filters)
        .order_by(Song.id)
        .offset((query.page_num - 1) * query.page_size)
        .limit(query.page_size)
    )
    return int(total or 0), [dict(row) for row in rows.mappings()]
