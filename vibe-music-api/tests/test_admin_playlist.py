import io
from datetime import datetime

import pytest
from sqlalchemy import func, select
from starlette.requests import Request
from test_account import account as account
from test_account import bearer
from test_account import login as user_login
from test_admin import admin as admin
from test_admin import login
from test_favorite import catalogue as catalogue
from test_profile import avatar_png

from app.models import Comment, Favorite, Playlist, PlaylistBinding, Song
from app.services import admin_playlist
from app.services.avatar import remove_avatar


async def test_playlist_add_edit_uniqueness_and_null_skip(account, admin):
    headers = bearer(await login(account, admin))
    client, session = account["client"], account["session"]
    body = {
        "title": "Café НОВЫЙ",
        "style": "РОК",
        "introduction": "简介" * 500,
        "coverUrl": "/media/ignored",
    }
    assert (await client.post("/admin/addPlaylist", json=body, headers=headers)).json()[
        "message"
    ] == "添加成功"
    row = await session.scalar(select(Playlist))
    assert row.cover_url is None and row.introduction == body["introduction"]
    assert (
        await client.post(
            "/admin/addPlaylist", json={**body, "title": "CAFE новый"}, headers=headers
        )
    ).json()["message"] == "歌单已存在"
    assert (
        await client.put(
            "/admin/updatePlaylist",
            json={
                "playlistId": row.id,
                "title": None,
                "introduction": "",
                "style": None,
                "coverUrl": "/media/ignored",
            },
            headers=headers,
        )
    ).json()["message"] == "更新成功"
    await session.refresh(row)
    assert (
        row.title == body["title"]
        and row.style == "РОК"
        and row.introduction == ""
        and row.cover_url is None
    )
    session.add(Playlist(title="Another"))
    await session.commit()
    assert (
        await client.put(
            "/admin/updatePlaylist",
            json={"playlistId": row.id, "title": "another"},
            headers=headers,
        )
    ).json()["message"] == "歌单已存在"
    assert (
        await client.put(
            "/admin/updatePlaylist",
            json={"playlistId": 999999999, "style": "古典"},
            headers=headers,
        )
    ).json()["message"] == "更新失败"


async def test_playlist_list_count_style_equality_order_and_allowlist(account, admin):
    headers = bearer(await login(account, admin))
    client, session = account["client"], account["session"]
    first = Playlist(title="Café Playlist", style="РОК", introduction="内容")
    second = Playlist(title="Other", style="РОК流行")
    session.add_all([first, second])
    await session.commit()
    query = {"pageNum": 1, "pageSize": 10}
    result = await client.post("/admin/getAllPlaylists", json=query, headers=headers)
    assert result.headers["cache-control"] == "private, no-store"
    rows = result.json()["data"]["items"]
    assert [row["playlistId"] for row in rows] == [second.id, first.id]
    assert set(rows[0]) == {"playlistId", "title", "coverUrl", "style", "introduction"}
    filtered = (
        await client.post(
            "/admin/getAllPlaylists",
            json={**query, "title": "CAFE", "style": "рок"},
            headers=headers,
        )
    ).json()["data"]
    assert filtered["total"] == 1 and filtered["items"][0]["playlistId"] == first.id
    assert (
        await client.get("/admin/getAllPlaylistsCount", params={"style": "рок"}, headers=headers)
    ).json()["data"] == 1
    assert (
        await client.post("/admin/getAllPlaylists", json={**query, "pageNum": 3}, headers=headers)
    ).json()["data"] == {"total": 0, "items": None}


async def test_playlist_and_binding_endpoints_require_admin_and_bounds(account, admin, catalogue):
    admin_token = await login(account, admin)
    user = await user_login(account)
    client = account["client"]
    identity = catalogue["playlist"].id
    params = {"playlistId": identity, "songId": catalogue["songs"][1].id}
    for method, path, kwargs in [
        ("GET", "/admin/getAllPlaylistsCount", {}),
        ("POST", "/admin/getAllPlaylists", {"json": {"pageNum": 1, "pageSize": 10}}),
        ("POST", "/admin/addPlaylist", {"json": {"title": "Test"}}),
        ("PUT", "/admin/updatePlaylist", {"json": {"playlistId": identity, "title": "Test"}}),
        (
            "PATCH",
            f"/admin/updatePlaylistCover/{identity}",
            {"files": {"cover": ("c.png", avatar_png())}},
        ),
        ("DELETE", f"/admin/deletePlaylist/{identity}", {}),
        ("DELETE", "/admin/deletePlaylists", {"json": [identity]}),
        ("POST", "/playlist-binding/addSong", {"params": params}),
        ("DELETE", "/playlist-binding/removeSong", {"params": params}),
    ]:
        assert (await client.request(method, path, **kwargs)).status_code == 401
        assert (
            await client.request(method, path, headers=bearer(user), **kwargs)
        ).status_code == 403
    for query in (
        {"pageNum": 0, "pageSize": 10},
        {"pageNum": 1, "pageSize": 101},
        {"pageNum": 2**31, "pageSize": 10},
    ):
        assert (
            await client.post("/admin/getAllPlaylists", json=query, headers=bearer(admin_token))
        ).status_code == 422
    assert (
        await client.post("/admin/addPlaylist", json={"title": ""}, headers=bearer(admin_token))
    ).status_code == 422
    assert (
        await client.post(
            "/playlist-binding/addSong",
            params={**params, "songId": 2**63},
            headers=bearer(admin_token),
        )
    ).status_code == 422


async def test_binding_add_duplicate_remove_missing_and_public_detail(account, admin, catalogue):
    headers = bearer(await login(account, admin))
    client, session = account["client"], account["session"]
    identity = catalogue["playlist"].id
    song = catalogue["songs"][1]
    params = {"playlistId": identity, "songId": song.id}
    assert (await client.post("/playlist-binding/addSong", params=params, headers=headers)).json()[
        "message"
    ] == "添加成功"
    assert (await client.post("/playlist-binding/addSong", params=params, headers=headers)).json()[
        "message"
    ] == "歌曲已在该歌单中"
    detail = (await client.get(f"/playlist/getPlaylistDetail/{identity}")).json()["data"]
    assert {row["songId"] for row in detail["songs"]} == {item.id for item in catalogue["songs"]}
    assert (
        await client.delete("/playlist-binding/removeSong", params=params, headers=headers)
    ).json()["message"] == "删除成功"
    assert (
        await client.delete("/playlist-binding/removeSong", params=params, headers=headers)
    ).json()["message"] == "歌曲不在该歌单中"
    assert await session.scalar(select(Song.id).where(Song.id == song.id)) == song.id
    for path, method in [
        ("/playlist-binding/addSong", "POST"),
        ("/playlist-binding/removeSong", "DELETE"),
    ]:
        assert (
            await client.request(
                method, path, params={**params, "playlistId": 999999999}, headers=headers
            )
        ).json()["message"] == "歌单不存在"
        assert (
            await client.request(
                method, path, params={**params, "songId": 999999999}, headers=headers
            )
        ).json()["message"] == "歌曲不存在"


async def test_playlist_cover_upload_replace_read_and_reject(account, admin, catalogue):
    headers = bearer(await login(account, admin))
    client, session = account["client"], account["session"]
    row = catalogue["playlist"]
    paths = []
    try:
        for _ in range(2):
            assert (
                await client.patch(
                    f"/admin/updatePlaylistCover/{row.id}",
                    headers=headers,
                    files={"cover": ("../../image.svg", avatar_png(), "image/svg+xml")},
                )
            ).json()["message"] == "更新成功"
            await session.refresh(row)
            paths.append(row.cover_url)
            assert row.cover_key.startswith(f"playlists/{row.id}/")
            media = await client.get(row.cover_url)
            assert media.status_code == 200 and media.headers["content-type"] == "image/png"
        assert (await client.get(paths[0])).status_code == 404
        assert (
            await client.patch(
                f"/admin/updatePlaylistCover/{row.id}",
                headers=headers,
                files={"cover": ("bad.png", b"bad")},
            )
        ).json()["code"] == 1
        assert (await client.get(paths[-1])).status_code == 200
    finally:
        for path in paths:
            await remove_avatar(
                Request({"type": "http", "app": account["app"]}), path.removeprefix("/media/")
            )


@pytest.mark.parametrize("batch", [False, True])
async def test_delete_playlist_cascades_and_preserves_songs_and_shared_media(
    account, admin, catalogue, batch
):
    headers = bearer(await login(account, admin))
    session, client = account["session"], account["client"]
    identity = catalogue["playlist"].id
    now = datetime.now()
    key = f"playlists/shared-{account['tag']}.png"
    catalogue["playlist"].cover_key = key
    second = Playlist(title="Surviving playlist", cover_key=key)
    session.add_all(
        [
            second,
            Favorite(user_id=account["user"].id, playlist_id=identity, type=1, create_time=now),
            Comment(
                user_id=account["user"].id,
                playlist_id=identity,
                type=1,
                content="test",
                create_time=now,
            ),
        ]
    )
    await session.commit()
    request = Request({"type": "http", "app": account["app"]})
    try:
        account["app"].state.media_store.put_object(
            account["app"].state.settings.minio_bucket, key, io.BytesIO(b"shared"), 6
        )
        path = "/admin/deletePlaylists" if batch else f"/admin/deletePlaylist/{identity}"
        kwargs = {"json": [identity, identity, 999999999]} if batch else {}
        assert (await client.request("DELETE", path, headers=headers, **kwargs)).json()[
            "message"
        ] == "删除成功"
        for model in (PlaylistBinding, Favorite, Comment):
            assert (
                await session.scalar(
                    select(func.count()).select_from(model).where(model.playlist_id == identity)
                )
                == 0
            )
        assert await session.scalar(select(func.count()).select_from(Song)) == 2
        assert (await client.get("/media/" + key)).status_code == 200
        assert (await client.request("DELETE", path, headers=headers, **kwargs)).json()[
            "message"
        ] == ("删除失败" if batch else "歌单NOT_FOUND")
        assert (
            await client.request("DELETE", "/admin/deletePlaylists", json=[], headers=headers)
        ).json()["message"] == "删除失败"
    finally:
        await remove_avatar(request, key)


async def test_cover_commit_failure_cleans_new_file(account, admin, catalogue, monkeypatch):
    headers = bearer(await login(account, admin))
    session = account["session"]
    identity = catalogue["playlist"].id
    await session.commit()
    store = account["app"].state.media_store
    put = store.put_object
    keys = []

    def track(bucket, key, *args, **kwargs):
        keys.append(key)
        return put(bucket, key, *args, **kwargs)

    async def fail():
        raise RuntimeError("playlist cover commit failure")

    monkeypatch.setattr(store, "put_object", track)
    monkeypatch.setattr(session, "commit", fail)
    with pytest.raises(RuntimeError, match="playlist cover commit failure"):
        await account["client"].patch(
            f"/admin/updatePlaylistCover/{identity}",
            headers=headers,
            files={"cover": ("c.png", avatar_png())},
        )
    assert len(keys) == 1 and (await account["client"].get("/media/" + keys[0])).status_code == 404
    assert await session.scalar(select(Playlist.cover_key).where(Playlist.id == identity)) is None


async def test_delete_failure_restores_playlist_and_bindings(account, catalogue, monkeypatch):
    session = account["session"]
    identity = catalogue["playlist"].id
    await session.commit()

    async def fail():
        raise RuntimeError("playlist delete commit failure")

    monkeypatch.setattr(session, "commit", fail)
    with pytest.raises(RuntimeError, match="playlist delete commit failure"):
        await admin_playlist.remove(
            session, Request({"type": "http", "app": account["app"]}), [identity]
        )
    assert await session.scalar(select(Playlist.id).where(Playlist.id == identity)) == identity
    assert (
        await session.scalar(
            select(func.count())
            .select_from(PlaylistBinding)
            .where(PlaylistBinding.playlist_id == identity)
        )
        == 1
    )
