from datetime import date, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select
from starlette.requests import Request
from test_account import account as account
from test_account import bearer, login

from app.models import Artist, Favorite, Playlist, PlaylistBinding, Song, User
from app.services.auth import issue_token


@pytest_asyncio.fixture
async def catalogue(account):
    session = account["session"]
    artist = Artist(name="Café Artist")
    playlist = Playlist(title="Favorite Playlist", style="华语流行")
    session.add_all([artist, playlist])
    await session.flush()
    songs = [
        Song(artist_id=artist.id, name=name, album="Album", release_time=date(2025, 1, 1))
        for name in ("Café Song", "Another Song")
    ]
    session.add_all(songs)
    await session.flush()
    session.add(PlaylistBinding(playlist_id=playlist.id, song_id=songs[0].id))
    await session.flush()
    return {"songs": songs, "playlist": playlist, "artist": artist}


async def other_identity(account):
    email = "other_" + account["email"]
    account["emails"].add(email)
    user = User(
        username="other" + account["tag"],
        email=email,
        password=account["user"].password,
        status=0,
        create_time=datetime.now(),
        update_time=datetime.now(),
    )
    account["session"].add(user)
    await account["session"].flush()
    token = await issue_token(Request({"type": "http", "app": account["app"]}), user)
    return user, token


@pytest.mark.parametrize("kind", ["Song", "Playlist"])
async def test_collect_duplicate_cancel_and_empty_page(account, catalogue, kind):
    token = await login(account)
    identity = catalogue["songs"][0].id if kind == "Song" else catalogue["playlist"].id
    params = {f"{kind.lower()}Id": identity}
    client = account["client"]
    url = f"/favorite/collect{kind}"
    assert (await client.post(url, params=params)).status_code == 401
    assert (await client.post(url, params=params, headers=bearer(token))).json()[
        "message"
    ] == "添加成功"
    assert (await client.post(url, params=params, headers=bearer(token))).json()[
        "message"
    ] == "添加失败"
    page = await client.post(
        f"/favorite/getFavorite{kind}s", json={"pageNum": 1, "pageSize": 10}, headers=bearer(token)
    )
    assert page.headers["cache-control"] == "private, no-store"
    assert page.json()["data"]["total"] == 1
    if kind == "Song":
        assert page.json()["data"]["items"][0]["likeStatus"] == 1
    cancel = f"/favorite/cancelCollect{kind}"
    assert (await client.delete(cancel, params=params, headers=bearer(token))).json()[
        "message"
    ] == "删除成功"
    assert (await client.delete(cancel, params=params, headers=bearer(token))).json()[
        "message"
    ] == "删除失败"
    empty = await client.post(
        f"/favorite/getFavorite{kind}s", json={"pageNum": 1, "pageSize": 10}, headers=bearer(token)
    )
    assert empty.json()["data"] == {"total": 0, "items": []}


async def test_song_favorites_filter_order_and_do_not_join_other_users(account, catalogue):
    token = await login(account)
    other, other_token = await other_identity(account)
    now = datetime.now()
    first, second = catalogue["songs"]
    session = account["session"]
    session.add_all(
        [
            Favorite(
                user_id=account["user"].id,
                type=0,
                song_id=first.id,
                create_time=now - timedelta(days=1),
            ),
            Favorite(user_id=account["user"].id, type=0, song_id=second.id, create_time=now),
            Favorite(
                user_id=other.id, type=0, song_id=first.id, create_time=now + timedelta(days=1)
            ),
            Favorite(
                user_id=other.id, type=0, song_id=first.id, create_time=now + timedelta(days=2)
            ),
        ]
    )
    await session.flush()
    client = account["client"]
    body = {"pageNum": 1, "pageSize": 10}
    own = (
        await client.post("/favorite/getFavoriteSongs", json=body, headers=bearer(token))
    ).json()["data"]
    assert own["total"] == 2
    assert [row["songId"] for row in own["items"]] == [second.id, first.id]
    other_page = (
        await client.post("/favorite/getFavoriteSongs", json=body, headers=bearer(other_token))
    ).json()["data"]
    assert other_page["total"] == 1 and len(other_page["items"]) == 1
    filtered = (
        await client.post(
            "/favorite/getFavoriteSongs",
            json={**body, "songName": "cafe", "artistName": "CAFE", "album": "alb"},
            headers=bearer(token),
        )
    ).json()["data"]
    assert filtered["total"] == 1 and filtered["items"][0]["songId"] == first.id
    beyond = (
        await client.post(
            "/favorite/getFavoriteSongs", json={**body, "pageNum": 99}, headers=bearer(token)
        )
    ).json()["data"]
    assert beyond == {"total": 2, "items": []}


async def test_playlist_favorite_style_uses_substring_and_is_owned(account, catalogue):
    token = await login(account)
    _, other_token = await other_identity(account)
    playlist = catalogue["playlist"]
    client = account["client"]
    params = {"playlistId": playlist.id}
    await client.post("/favorite/collectPlaylist", params=params, headers=bearer(token))
    query = {"pageNum": 1, "pageSize": 10, "style": "流"}
    own = (
        await client.post("/favorite/getFavoritePlaylists", json=query, headers=bearer(token))
    ).json()["data"]
    assert own["total"] == 1
    assert set(own["items"][0]) == {"playlistId", "title", "coverUrl"}
    assert (await client.post("/playlist/getAllPlaylists", json=query)).json()["data"]["total"] == 0
    assert (
        await client.delete(
            "/favorite/cancelCollectPlaylist", params=params, headers=bearer(other_token)
        )
    ).json()["code"] == 1
    other = (
        await client.post("/favorite/getFavoritePlaylists", json=query, headers=bearer(other_token))
    ).json()["data"]
    assert other == {"total": 0, "items": []}


async def test_public_likes_are_scoped_and_expired_token_remains_anonymous(account, catalogue):
    token = await login(account)
    _, other_token = await other_identity(account)
    song = catalogue["songs"][0]
    playlist = catalogue["playlist"]
    client = account["client"]
    await client.post("/favorite/collectSong", params={"songId": song.id}, headers=bearer(token))
    await client.post(
        "/favorite/collectPlaylist", params={"playlistId": playlist.id}, headers=bearer(token)
    )
    for path in (f"/song/getSongDetail/{song.id}", f"/playlist/getPlaylistDetail/{playlist.id}"):
        own = await client.get(path, headers=bearer(token))
        assert own.json()["data"]["likeStatus"] == 1
        assert own.headers["cache-control"] == "private, no-store"
        assert (await client.get(path, headers=bearer(other_token))).json()["data"][
            "likeStatus"
        ] != 1
    artist = (
        await client.get(f"/artist/getArtistDetail/{catalogue['artist'].id}", headers=bearer(token))
    ).json()["data"]
    assert next(row for row in artist["songs"] if row["songId"] == song.id)["likeStatus"] == 1
    query = {"pageNum": 1, "pageSize": 10}
    own_list = (await client.post("/song/getAllSongs", json=query, headers=bearer(token))).json()[
        "data"
    ]
    assert next(row for row in own_list["items"] if row["songId"] == song.id)["likeStatus"] == 1
    await client.post("/user/logout", headers=bearer(token))
    anonymous = await client.get(f"/song/getSongDetail/{song.id}", headers=bearer(token))
    assert anonymous.status_code == 200 and anonymous.json()["data"]["likeStatus"] is None
    assert (
        await client.post("/favorite/getFavoriteSongs", json=query, headers=bearer(token))
    ).status_code == 401


@pytest.mark.parametrize("kind", ["Song", "Playlist"])
async def test_missing_target_and_wrong_parameter_location(account, kind):
    token = await login(account)
    client = account["client"]
    body = {f"{kind.lower()}Id": -999}
    missing = await client.post(f"/favorite/collect{kind}", params=body, headers=bearer(token))
    assert missing.json()["message"] == "添加失败"
    misplaced = await client.post(f"/favorite/collect{kind}", json=body, headers=bearer(token))
    assert misplaced.status_code == 422
    assert not (
        await account["session"].scalars(
            select(Favorite).where(Favorite.user_id == account["user"].id)
        )
    ).all()
