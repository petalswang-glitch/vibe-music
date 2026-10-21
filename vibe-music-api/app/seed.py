"""Explicit development-only seed; never executed during application startup."""

import asyncio
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models import Artist, Song


async def seed():
    settings = get_settings()
    if settings.app_env != "development":
        raise RuntimeError("Seed is only permitted with APP_ENV=development")
    engine = create_async_engine(settings.database_url, connect_args={"timeout": 5})
    try:
        async with async_sessionmaker(engine).begin() as session:
            if await session.scalar(
                select(func.count()).select_from(Artist)
            ) or await session.scalar(select(func.count()).select_from(Song)):
                print("Seed skipped: artist/song tables already contain data.")
                return
            artist = Artist(name="Vibe 开发测试音乐人", introduction="隔离测试元数据，不是历史曲库")
            session.add(artist)
            await session.flush()
            for name, album, style in (
                ("午后散步 · 测试数据", "开发测试专辑", "轻音乐"),
                ("夜间电台 · 测试数据", "开发测试专辑", "电子"),
                ("Paper Moon · Demo", "Development Sessions", "爵士"),
            ):
                session.add(
                    Song(
                        artist_id=artist.id,
                        name=name,
                        album=album,
                        style=style,
                        release_time=date(2026, 1, 1),
                    )
                )
        print("Created 1 development artist and 3 songs; no audio files are implied.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
