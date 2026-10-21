import os
from datetime import date

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.session import get_session
from app.main import create_app
from app.models import Artist, Song


@pytest_asyncio.fixture
async def database_session():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set TEST_DATABASE_URL to an Alembic-initialized disposable *_test database")
    if not (make_url(database_url).database or "").endswith("_test"):
        pytest.fail("Integration tests require a database name ending in _test")
    engine = create_async_engine(database_url, connect_args={"timeout": 5})
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            factory = async_sessionmaker(
                bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
            )
            try:
                async with factory() as session:
                    yield session
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def song_client():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set TEST_DATABASE_URL to an Alembic-initialized disposable *_test database")
    if not (make_url(database_url).database or "").endswith("_test"):
        pytest.fail("Integration tests require a database name ending in _test")
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            factory = async_sessionmaker(
                bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
            )
            async with factory() as session:
                artist = Artist(name="测试歌手 Alicé")
                session.add(artist)
                await session.flush()
                session.add_all(
                    [
                        Song(
                            artist_id=artist.id,
                            name="Morning",
                            album="Sunrise LøVë",
                            release_time=date(2020, 1, 2),
                        ),
                        Song(
                            artist_id=artist.id,
                            name="夜曲",
                            album="Night",
                            release_time=date(2021, 2, 3),
                        ),
                    ]
                )
                await session.commit()

            async def override_session():
                async with factory() as session:
                    yield session

            app = create_app()
            app.dependency_overrides[get_session] = override_session
            try:
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as client:
                    yield client
            finally:
                app.dependency_overrides.clear()
                await transaction.rollback()
    finally:
        await engine.dispose()
