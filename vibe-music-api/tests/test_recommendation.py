import json
from datetime import date, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from redis.exceptions import ConnectionError
from sqlalchemy import delete
from test_account import account as account
from test_account import bearer, login
from test_favorite import other_identity

from app.models import Artist, Favorite, Genre, Playlist, Song, Style
from app.services import recommendation as service


@pytest_asyncio.fixture
async def library(account):
    session = account["session"]
    artist = Artist(name="Recommendation Artist")
    styles = [Style(name="rec-a-" + account["tag"]), Style(name="rec-b-" + account["tag"])]
    session.add_all([artist, *styles])
    await session.flush()
    songs = [
        Song(
            artist_id=artist.id,
            name=f"Track {index}",
            album="Demo",
            release_time=date(2020, 1, 1) + timedelta(days=index),
        )
        for index in range(100)
    ]
    session.add_all(songs)
    await session.flush()
    session.add_all(
        [
            Genre(song_id=song.id, style_id=styles[0 if index < 95 else 1].id)
            for index, song in enumerate(songs)
        ]
    )
    session.add(
        Favorite(
            user_id=account["user"].id, type=0, song_id=songs[0].id, create_time=datetime.now()
        )
    )
    await session.flush()
    return songs, styles


async def test_pool_latest_80_hit_ttl_and_metadata_hydration(account, library, monkeypatch):
    songs, styles = library
    token = await login(account)
    client, redis = account["client"], account["redis"]
    url = "/song/getRecommendedSongs"
    first = await client.get(url, headers=bearer(token))
    assert first.headers["cache-control"] == "private, no-store"
    rows = first.json()["data"]
    assert len(rows) == 20 and len({row["songId"] for row in rows}) == 20
    expected = {song.id for song in songs[15:95]}
    assert {row["songId"] for row in rows} <= expected
    key = service.pool_key(account["user"].id, [songs[0].id], [styles[0].id])
    assert set(json.loads(await redis.get(key))) == expected
    assert 1700 <= await redis.ttl(key) <= 1800
    spy = AsyncMock(side_effect=AssertionError("cache hit must not rebuild candidates"))
    monkeypatch.setattr(service, "candidate_ids", spy)
    for song in songs[15:95]:
        song.album = "Updated album"
    await account["session"].flush()
    second = await client.get(url, headers=bearer(token))
    assert {row["album"] for row in second.json()["data"]} == {"Updated album"}
    spy.assert_not_awaited()


async def test_preferences_change_and_other_user_do_not_reuse_pool(account, library):
    songs, styles = library
    token = await login(account)
    client, redis = account["client"], account["redis"]
    url = "/song/getRecommendedSongs"
    await client.get(url, headers=bearer(token))
    old = service.pool_key(account["user"].id, [songs[0].id], [styles[0].id])
    params = {"songId": songs[94].id}
    assert (
        await client.post("/favorite/collectSong", params=params, headers=bearer(token))
    ).json()["code"] == 0
    # A delayed old request can write its old key, but cannot poison new preferences.
    await redis.set(old, json.dumps([songs[94].id]), ex=1800)
    own = (await client.get(url, headers=bearer(token))).json()["data"]
    assert songs[94].id not in {row["songId"] for row in own}
    new = service.pool_key(account["user"].id, [songs[0].id, songs[94].id], [styles[0].id])
    assert len(json.loads(await redis.get(new))) == 80
    other, other_token = await other_identity(account)
    account["session"].add(
        Favorite(user_id=other.id, type=0, song_id=songs[95].id, create_time=datetime.now())
    )
    await account["session"].flush()
    result = (await client.get(url, headers=bearer(other_token))).json()["data"]
    # Four matching candidates lead, followed by the original random fallback.
    assert {song.id for song in songs[96:]} <= {row["songId"] for row in result}
    key = service.pool_key(other.id, [songs[95].id], [styles[1].id])
    assert set(json.loads(await redis.get(key))) == {song.id for song in songs[96:]}


@pytest.mark.parametrize(
    "bad", ["not-json", "{}", "[true]", "[1,1]", "[-1]", "[999999999]", "[999999999999999999999]"]
)
async def test_corrupt_or_deleted_cached_candidates_rebuild(account, library, bad):
    songs, styles = library
    key = service.pool_key(account["user"].id, [songs[0].id], [styles[0].id])
    await account["redis"].set(key, bad, ex=1800)
    result = await service.songs(account["session"], account["user"].id, account["redis"])
    assert len(result) == 20
    assert set(json.loads(await account["redis"].get(key))) == {song.id for song in songs[15:95]}


async def test_random_branches_empty_pool_and_cache_outage(account, library):
    songs, _ = library
    session, redis = account["session"], account["redis"]
    broken = AsyncMock()
    broken.get.side_effect = ConnectionError("cache offline")
    broken.set.side_effect = ConnectionError("cache offline")
    assert len(await service.songs(session, account["user"].id, broken)) == 20
    assert len(await service.songs(session, None, broken)) == 20
    await session.execute(delete(Genre))
    assert len(await service.songs(session, account["user"].id, redis)) == 20
    await session.execute(delete(Favorite))
    assert len(await service.songs(session, account["user"].id, redis)) == 20
    await session.execute(delete(Song))
    assert await service.songs(session, account["user"].id, redis) == []


async def test_empty_matching_pool_uses_random_without_empty_cache(account, library):
    songs, styles = library
    session, redis = account["session"], account["redis"]
    await session.execute(delete(Genre).where(Genre.song_id != songs[0].id))
    rows = await service.songs(session, account["user"].id, redis)
    assert len(rows) == 20
    key = service.pool_key(account["user"].id, [songs[0].id], [styles[0].id])
    assert await redis.get(key) is None


@pytest.mark.parametrize("style, variant", [("Café", "CAFE"), ("РОК", "рок")])
async def test_playlist_uses_real_style_excludes_favorites_and_fills(account, style, variant):
    session, client = account["session"], account["client"]
    token = await login(account)
    playlists = [
        Playlist(title=f"List {index}", style=style if index < 13 else "Other")
        for index in range(16)
    ]
    session.add_all(playlists)
    await session.flush()
    session.add(
        Favorite(
            user_id=account["user"].id,
            type=1,
            playlist_id=playlists[0].id,
            create_time=datetime.now(),
        )
    )
    # Legacy MySQL style comparison ignores case and accents.
    playlists[1].style = variant
    await session.flush()
    public = (
        await client.post(
            "/playlist/getAllPlaylists", json={"pageNum": 1, "pageSize": 20, "style": variant}
        )
    ).json()["data"]
    assert public["total"] == 13
    url = "/playlist/getRecommendedPlaylists"
    response = await client.get(url, headers=bearer(token))
    assert response.headers["cache-control"] == "private, no-store"
    ids = {row["playlistId"] for row in response.json()["data"]}
    assert len(ids) == 10 and ids <= {row.id for row in playlists[1:13]}
    await session.execute(
        delete(Playlist).where(Playlist.id.in_([row.id for row in playlists[4:]]))
    )
    rows = (await client.get(url, headers=bearer(token))).json()["data"]
    assert len(rows) == 4 and len({row["playlistId"] for row in rows}) == 4
    assert all(set(row) == {"playlistId", "title", "coverUrl"} for row in rows)
    for headers in ({}, bearer("invalid")):
        response = await client.get(url, headers=headers)
        assert response.status_code == 200 and len(response.json()["data"]) == 4
