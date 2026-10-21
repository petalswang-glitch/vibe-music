from datetime import date, datetime

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

from app.models import Artist, Comment, Favorite, Genre, PlaylistBinding, Song, Style
from app.services import admin_song
from app.services.avatar import remove_avatar


def mp3_bytes():
    # Synthetic silent MPEG-1 Layer III frames; no historical/copyrighted media.
    return (b"\xff\xfb\x90\x00" + bytes(413)) * 100


def body(catalogue, **changes):
    return dict(
        artistId=catalogue["artist"].id,
        songName="Café Test",
        album="Album",
        releaseTime="2026-01-02",
        style="Café,CAFE,Unknown",
        **changes,
    )


async def test_add_update_styles_preserves_duplicates_and_partial_semantics(
    account, admin, catalogue
):
    headers = bearer(await login(account, admin))
    client, session = account["client"], account["session"]
    style = Style(name="Café")
    session.add(style)
    await session.commit()
    payload = body(catalogue)
    for _ in range(2):
        assert (await client.post("/admin/addSong", json=payload, headers=headers)).json()[
            "message"
        ] == "添加成功"
    rows = (
        await session.scalars(
            select(Song).where(Song.name == payload["songName"]).order_by(Song.id)
        )
    ).all()
    assert len(rows) == 2 and rows[0].id != rows[1].id
    assert (
        await session.scalars(
            select(Genre.song_id).where(Genre.song_id.in_([row.id for row in rows]))
        )
    ).all() == [row.id for row in rows]
    row = rows[0]
    assert (
        await client.put(
            "/admin/updateSong",
            json={
                "songId": row.id,
                "album": "Changed",
                "coverUrl": "/media/evil",
                "lyric": "not editable",
            },
            headers=headers,
        )
    ).json()["message"] == "更新成功"
    await session.refresh(row)
    assert (
        row.album == "Changed"
        and row.name == payload["songName"]
        and row.style == payload["style"]
        and row.cover_url is None
        and row.lyric is None
    )
    assert (
        await session.scalar(select(func.count()).select_from(Genre).where(Genre.song_id == row.id))
        == 0
    )
    assert (
        await client.put(
            "/admin/updateSong", json={"songId": row.id, "style": "Café,Café"}, headers=headers
        )
    ).json()["code"] == 0
    assert (await session.scalars(select(Genre.style_id).where(Genre.song_id == row.id))).all() == [
        style.id
    ]
    assert (
        await client.put("/admin/updateSong", json={"songId": row.id, "style": ""}, headers=headers)
    ).json()["code"] == 0
    assert (
        await session.scalar(select(func.count()).select_from(Genre).where(Genre.song_id == row.id))
        == 0
    )
    for identity in (None, 0, -1, 999999999):
        assert (
            await client.post(
                "/admin/addSong", json={**payload, "artistId": identity}, headers=headers
            )
        ).json()["message"] == "请选择歌手"
    assert (
        await client.put(
            "/admin/updateSong", json={"songId": 999999999, "album": "missing"}, headers=headers
        )
    ).json()["message"] == "歌曲NOT_FOUND"


async def test_list_count_filter_order_fields_and_integer_bounds(account, admin, catalogue):
    token = await login(account, admin)
    headers = bearer(token)
    session, client = account["session"], account["client"]
    catalogue["songs"][0].style = "华语流行,摇滚"
    catalogue["songs"][1].release_time = date(2026, 2, 3)
    await session.commit()
    query = {"pageNum": 1, "pageSize": 10, "artistId": catalogue["artist"].id}
    response = await client.post("/admin/getAllSongsByArtist", json=query, headers=headers)
    assert response.headers["cache-control"] == "private, no-store"
    rows = response.json()["data"]["items"]
    assert [row["songId"] for row in rows] == [catalogue["songs"][1].id, catalogue["songs"][0].id]
    assert set(rows[0]) == {
        "songId",
        "artistName",
        "songName",
        "album",
        "lyric",
        "duration",
        "style",
        "coverUrl",
        "audioUrl",
        "releaseTime",
    }
    assert rows[0]["releaseTime"] == "2026-02-03"
    filtered = (
        await client.post(
            "/admin/getAllSongsByArtist",
            json={**query, "songName": "CAFE", "album": "ALB"},
            headers=headers,
        )
    ).json()["data"]
    assert filtered["total"] == 1
    assert (
        await client.get("/admin/getAllSongsCount", params={"style": "流行"}, headers=headers)
    ).json()["data"] == 1
    assert (
        await client.post(
            "/admin/getAllSongsByArtist", json={**query, "pageNum": 10}, headers=headers
        )
    ).json()["data"] == {"total": 0, "items": None}
    assert (
        await client.post(
            "/admin/getAllSongsByArtist", json={**query, "artistId": ""}, headers=headers
        )
    ).json()["data"]["total"] == 2
    assert (
        await client.post(
            "/admin/getAllSongsByArtist", json={**query, "pageNum": 2**31}, headers=headers
        )
    ).status_code == 422


async def test_song_endpoints_require_admin_and_validate(account, admin, catalogue):
    admin_token = await login(account, admin)
    user = await user_login(account)
    client = account["client"]
    identity = catalogue["songs"][0].id
    for method, path, kwargs in [
        ("GET", "/admin/getAllSongsCount", {}),
        ("POST", "/admin/getAllSongsByArtist", {"json": {"pageNum": 1, "pageSize": 10}}),
        ("POST", "/admin/addSong", {"json": body(catalogue)}),
        ("PUT", "/admin/updateSong", {"json": {"songId": identity, "album": "test"}}),
        (
            "PATCH",
            f"/admin/updateSongCover/{identity}",
            {"files": {"cover": ("c.png", avatar_png())}},
        ),
        (
            "PATCH",
            f"/admin/updateSongAudio/{identity}",
            {"files": {"audio": ("a.mp3", mp3_bytes())}, "data": {"duration": "2.61"}},
        ),
        ("DELETE", f"/admin/deleteSong/{identity}", {}),
        ("DELETE", "/admin/deleteSongs", {"json": [identity]}),
    ]:
        assert (await client.request(method, path, **kwargs)).status_code == 401
        assert (
            await client.request(method, path, headers=bearer(user), **kwargs)
        ).status_code == 403
    for changes in (
        {"songName": ""},
        {"songName": "x" * 256},
        {"releaseTime": "bad"},
        {"style": "x" * 256},
        {"artistId": 2**63},
    ):
        assert (
            await client.post(
                "/admin/addSong", json={**body(catalogue), **changes}, headers=bearer(admin_token)
            )
        ).status_code == 422


async def test_cover_audio_replace_range_duration_and_validation(account, admin, catalogue):
    headers = bearer(await login(account, admin))
    session, client = account["session"], account["client"]
    song = catalogue["songs"][0]
    identity = song.id
    paths = []
    try:
        for _ in range(2):
            assert (
                await client.patch(
                    f"/admin/updateSongCover/{identity}",
                    headers=headers,
                    files={"cover": ("../../unsafe.svg", avatar_png(), "image/svg+xml")},
                )
            ).json()["message"] == "更新成功"
            assert (
                await client.patch(
                    f"/admin/updateSongAudio/{identity}",
                    headers=headers,
                    files={"audio": ("../../unsafe.mp3", mp3_bytes(), "text/plain")},
                    data={"duration": "2.61"},
                )
            ).json()["code"] == 0
            await session.refresh(song)
            paths.extend([song.cover_url, song.audio_url])
            assert (
                song.cover_key.startswith("songCovers/")
                and song.audio_key.startswith("songs/")
                and song.duration == "2.61"
            )
            assert (await client.get(song.cover_url)).headers["content-type"] == "image/png"
            partial = await client.get(song.audio_url, headers={"Range": "bytes=0-7"})
            assert (
                partial.status_code == 206
                and partial.content == mp3_bytes()[:8]
                and partial.headers["content-type"] == "audio/mpeg"
            )
        for path in paths[:2]:
            assert (await client.get(path)).status_code == 404
        for filename, data, message in [
            ("bad.mp3", b"not audio", "请选择有效的MP3音频文件"),
            ("bad.wav", mp3_bytes(), "只能上传.mp3格式的音频文件"),
        ]:
            assert (
                await client.patch(
                    f"/admin/updateSongAudio/{identity}",
                    headers=headers,
                    files={"audio": (filename, data)},
                    data={"duration": "2.61"},
                )
            ).json()["message"] == message
        for duration in ("NaN", "-1", "Infinity", "1" * 11):
            assert (
                await client.patch(
                    f"/admin/updateSongAudio/{identity}",
                    headers=headers,
                    files={"audio": ("a.mp3", mp3_bytes())},
                    data={"duration": duration},
                )
            ).status_code == 422
        assert (
            await client.patch(
                f"/admin/updateSongAudio/{identity}",
                headers=headers,
                files={"audio": ("a.mp3", mp3_bytes())},
                data={"duration": "0"},
            )
        ).json()["code"] == 1
        assert (
            await client.patch(
                f"/admin/updateSongCover/{identity}",
                headers=headers,
                files={"cover": ("bad.png", b"bad")},
            )
        ).json()["code"] == 1
        await session.refresh(song)
        assert song.audio_url == paths[-1] and song.cover_url == paths[-2]
    finally:
        for path in paths:
            await remove_avatar(
                Request({"type": "http", "app": account["app"]}), path.removeprefix("/media/")
            )


@pytest.mark.parametrize("batch", [False, True])
async def test_delete_song_preserves_artist_playlist_and_cascades(account, admin, catalogue, batch):
    headers = bearer(await login(account, admin))
    session, client = account["session"], account["client"]
    identity = catalogue["songs"][0].id
    style = Style(name="Delete Style " + account["tag"])
    session.add(style)
    await session.flush()
    session.add_all(
        [
            Genre(song_id=identity, style_id=style.id),
            Comment(
                song_id=identity,
                user_id=account["user"].id,
                content="test",
                type=0,
                create_time=datetime.now(),
            ),
            Favorite(
                song_id=identity, user_id=account["user"].id, type=0, create_time=datetime.now()
            ),
        ]
    )
    await session.commit()
    path = "/admin/deleteSongs" if batch else f"/admin/deleteSong/{identity}"
    kwargs = {"json": [identity, identity, 999999999]} if batch else {}
    assert (await client.request("DELETE", path, headers=headers, **kwargs)).json()[
        "message"
    ] == "删除成功"
    assert await session.scalar(select(Song.id).where(Song.id == identity)) is None
    for model in (Genre, Comment, Favorite, PlaylistBinding):
        assert (
            await session.scalar(
                select(func.count()).select_from(model).where(model.song_id == identity)
            )
            == 0
        )
    assert (
        await session.scalar(select(Artist.id).where(Artist.id == catalogue["artist"].id))
        is not None
    )
    assert (
        await session.scalar(select(Song.id).where(Song.id == catalogue["songs"][1].id)) is not None
    )
    assert (await client.request("DELETE", path, headers=headers, **kwargs)).json()["message"] == (
        "删除失败" if batch else "歌曲NOT_FOUND"
    )


async def test_audio_commit_failure_rolls_back_and_cleans_new_file(
    account, admin, catalogue, monkeypatch
):
    headers = bearer(await login(account, admin))
    session = account["session"]
    identity = catalogue["songs"][0].id
    await session.commit()
    store = account["app"].state.media_store
    put = store.put_object
    keys = []

    def track(bucket, key, *args, **kwargs):
        keys.append(key)
        return put(bucket, key, *args, **kwargs)

    async def fail():
        raise RuntimeError("audio commit failure")

    monkeypatch.setattr(store, "put_object", track)
    monkeypatch.setattr(session, "commit", fail)
    with pytest.raises(RuntimeError, match="audio commit failure"):
        await account["client"].patch(
            f"/admin/updateSongAudio/{identity}",
            headers=headers,
            files={"audio": ("a.mp3", mp3_bytes())},
            data={"duration": "2.61"},
        )
    assert len(keys) == 1 and (await account["client"].get("/media/" + keys[0])).status_code == 404
    assert await session.scalar(select(Song.audio_key).where(Song.id == identity)) is None


async def test_delete_failure_rolls_back_before_cleanup(account, catalogue, monkeypatch):
    session = account["session"]
    identity = catalogue["songs"][0].id
    await session.commit()

    async def fail():
        raise RuntimeError("delete commit failure")

    monkeypatch.setattr(session, "commit", fail)
    with pytest.raises(RuntimeError, match="delete commit failure"):
        await admin_song.remove(
            session, Request({"type": "http", "app": account["app"]}), [identity]
        )
    assert await session.scalar(select(Song.id).where(Song.id == identity)) == identity
    assert (
        await session.scalar(
            select(PlaylistBinding.song_id).where(PlaylistBinding.song_id == identity)
        )
        == identity
    )
