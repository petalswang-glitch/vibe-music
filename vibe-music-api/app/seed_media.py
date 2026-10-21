"""Explicit private-bucket initialization and clearly labelled synthetic audio fixture."""

import argparse
import asyncio
import io
import math
import struct
import wave

from minio import Minio
from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models import Artist, Song

DEMO_KEY = "__demo__/synthetic-tone.wav"


def demo_audio() -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        # Quiet 12-second generated tone, not a restored historical song.
        output.writeframes(
            b"".join(
                struct.pack("<h", int(1600 * math.sin(2 * math.pi * 440 * n / 16000)))
                for n in range(12 * 16000)
            )
        )
    return buffer.getvalue()


async def link_demo_songs(settings):
    database = make_url(settings.database_url).database or ""
    if database != "vibe_music" and not database.endswith("_test"):
        raise RuntimeError("Demo media linking is forbidden in a migrated or production database")
    engine = create_async_engine(settings.database_url, connect_args={"timeout": 5})
    try:
        async with async_sessionmaker(engine).begin() as session:
            songs = (
                await session.scalars(
                    select(Song)
                    .join(Artist, Artist.id == Song.artist_id)
                    .where(
                        Artist.name == "Vibe 开发测试音乐人",
                        Artist.introduction == "隔离测试元数据，不是历史曲库",
                        Song.name.in_(
                            [
                                "午后散步 · 测试数据",
                                "夜间电台 · 测试数据",
                                "Paper Moon · Demo",
                            ]
                        ),
                    )
                )
            ).all()
            if len(songs) != 3:
                raise RuntimeError(
                    "Expected the three isolated development songs; run app.seed first"
                )
            for song in songs:
                song.audio_url = f"/media/{DEMO_KEY}"
                song.duration = "12"
        print("Linked only 3 development songs to synthetic test audio.")
    finally:
        await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--link-demo-songs", action="store_true")
    args = parser.parse_args()
    settings = get_settings()
    if settings.app_env != "development":
        raise RuntimeError("Media fixture initialization requires APP_ENV=development")
    store = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
        region=settings.minio_region,
    )
    if not store.bucket_exists(settings.minio_bucket):
        store.make_bucket(settings.minio_bucket, location=settings.minio_region)
    data = demo_audio()
    store.put_object(
        settings.minio_bucket,
        DEMO_KEY,
        io.BytesIO(data),
        len(data),
        content_type="audio/wav",
        metadata={"fixture": "synthetic-not-historical"},
    )
    print(f"Private bucket ready; synthetic fixture: /media/{DEMO_KEY} ({len(data)} bytes)")
    if args.link_demo_songs:
        asyncio.run(link_demo_songs(settings))


if __name__ == "__main__":
    main()
