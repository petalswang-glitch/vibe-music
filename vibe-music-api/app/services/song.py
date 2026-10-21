from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.song import find_songs
from app.schemas.song import PageResult, Result, SongQuery, SongView


async def get_all_songs(session: AsyncSession, query: SongQuery) -> Result[PageResult[SongView]]:
    total, rows = await find_songs(session, query)
    if not rows:
        # Preserve the legacy no-results shape, including out-of-range pages.
        return Result(message="未找到相关数据", data=PageResult(total=0, items=None))
    return Result(data=PageResult(total=total, items=[SongView(**row) for row in rows]))
