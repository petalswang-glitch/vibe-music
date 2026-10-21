import io
from datetime import date, datetime

import pytest
from PIL import Image
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
from app.services import admin_artist
from app.services.avatar import remove_avatar


def payload(**changes):
    return dict(
        artistName="Café Новый",
        gender=0,
        birth="1988-01-02",
        area="中国台湾",
        introduction="歌手简介",
        **changes,
    )


async def test_artist_contract_list_count_names_and_crud(account, admin):
    headers = bearer(await login(account, admin))
    client, session = account["client"], account["session"]
    data = payload()
    assert (await client.post("/admin/addArtist", json=data, headers=headers)).json()[
        "message"
    ] == "添加成功"
    assert (
        await client.post(
            "/admin/addArtist", json={**data, "artistName": "CAFE НОВЫЙ"}, headers=headers
        )
    ).json()["message"] == "歌手已存在"
    first = await session.scalar(select(Artist))
    session.add(Artist(name="Other", gender=1, area="中国"))
    await session.commit()
    listing = await client.post(
        "/admin/getAllArtists", json={"pageNum": 1, "pageSize": 10}, headers=headers
    )
    assert listing.headers["cache-control"] == "private, no-store"
    rows = listing.json()["data"]["items"]
    assert rows[0]["artistName"] == "Other" and rows[1] == dict(
        artistId=first.id,
        artistName=data["artistName"],
        avatar=None,
        gender=0,
        birth="1988-01-02",
        area=data["area"],
        introduction=data["introduction"],
    )
    filtered = (
        await client.post(
            "/admin/getAllArtists",
            json={"pageNum": 1, "pageSize": 10, "gender": 0, "area": "台湾", "artistName": "CAFE"},
            headers=headers,
        )
    ).json()["data"]
    assert filtered["total"] == 1
    assert (
        await client.get(
            "/admin/getAllArtistsCount", params={"gender": 0, "area": "中国"}, headers=headers
        )
    ).json()["data"] == 0
    assert (
        await client.get(
            "/admin/getAllArtistsCount", params={"gender": 0, "area": "中国台湾"}, headers=headers
        )
    ).json()["data"] == 1
    assert (await client.get("/admin/getAllArtistNames", headers=headers)).json()["data"][0][
        "artistName"
    ] == "Other"
    assert (
        await client.post(
            "/admin/getAllArtists", json={"pageNum": 3, "pageSize": 10}, headers=headers
        )
    ).json()["data"] == {"total": 0, "items": None}
    edit = {
        **data,
        "artistId": first.id,
        "gender": None,
        "birth": "",
        "area": "",
        "introduction": "",
        "avatar": "https://untrusted.invalid/no.png",
        "avatarKey": "do-not-write",
    }
    assert (await client.put("/admin/updateArtist", json=edit, headers=headers)).json()[
        "message"
    ] == "更新成功"
    await session.refresh(first)
    assert (
        first.gender == 0
        and first.birth == date(1988, 1, 2)
        and first.area == ""
        and first.avatar_key is None
    )
    assert (
        await client.put(
            "/admin/updateArtist", json={**edit, "artistName": "Other"}, headers=headers
        )
    ).json()["message"] == "歌手已存在"
    assert (
        await client.put(
            "/admin/updateArtist", json={**edit, "artistId": 999999999}, headers=headers
        )
    ).json()["message"] == "更新失败"


@pytest.mark.parametrize("extra", [{}, {"artistName": None}])
async def test_artist_partial_update_preserves_omitted_name(account, admin, catalogue, extra):
    token = await login(account, admin)
    row = catalogue["artist"]
    previous = row.name
    response = await account["client"].put(
        "/admin/updateArtist",
        json={"artistId": row.id, "area": "英国", **extra},
        headers=bearer(token),
    )
    assert response.json()["message"] == "更新成功"
    await account["session"].refresh(row)
    assert row.name == previous and row.area == "英国"


async def test_all_artist_operations_require_admin_and_validate_fields(account, admin):
    admin_token = await login(account, admin)
    user_token = await user_login(account)
    client = account["client"]
    operations = [
        ("GET", "/admin/getAllArtistsCount", {}),
        ("GET", "/admin/getAllArtistNames", {}),
        ("POST", "/admin/getAllArtists", {"json": {"pageNum": 1, "pageSize": 10}}),
        ("POST", "/admin/addArtist", {"json": payload()}),
        ("PUT", "/admin/updateArtist", {"json": {**payload(), "artistId": 1}}),
        ("PATCH", "/admin/updateArtistAvatar/1", {"files": {"avatar": ("a.png", avatar_png())}}),
        ("DELETE", "/admin/deleteArtist/1", {}),
        ("DELETE", "/admin/deleteArtists", {"json": [1]}),
    ]
    for method, path, kwargs in operations:
        assert (await client.request(method, path, **kwargs)).status_code == 401
        assert (
            await client.request(method, path, headers=bearer(user_token), **kwargs)
        ).status_code == 403
    for change in (
        {"artistName": ""},
        {"artistName": "x" * 101},
        {"gender": 2**31},
        {"birth": "not-a-date"},
        {"area": "x" * 31},
        {"introduction": "x" * 256},
    ):
        assert (
            await client.post(
                "/admin/addArtist", json={**payload(), **change}, headers=bearer(admin_token)
            )
        ).status_code == 422
    assert (
        await client.get(
            "/admin/getAllArtistsCount", params={"gender": 2**31}, headers=bearer(admin_token)
        )
    ).status_code == 422
    assert (
        await client.request(
            "DELETE", "/admin/deleteArtists", json=[2**63], headers=bearer(admin_token)
        )
    ).status_code == 422


async def test_artist_avatar_real_upload_replace_and_read(account, admin, catalogue):
    token = await login(account, admin)
    client, session = account["client"], account["session"]
    row = catalogue["artist"]
    urls = []
    try:
        for _ in range(2):
            response = await client.patch(
                f"/admin/updateArtistAvatar/{row.id}",
                headers=bearer(token),
                files={"avatar": ("../../avatar.svg", avatar_png(), "image/svg+xml")},
            )
            assert response.json()["message"] == "更新成功"
            await session.refresh(row)
            assert row.avatar.startswith(f"/media/artists/{row.id}/")
            urls.append(row.avatar)
            media = await client.get(row.avatar)
            assert media.status_code == 200 and media.headers["content-type"] == "image/png"
            assert Image.open(io.BytesIO(media.content)).size == (80, 60)
        assert (await client.get(urls[0])).status_code == 404
        assert (
            await client.patch(
                f"/admin/updateArtistAvatar/{row.id}",
                headers=bearer(token),
                files={"avatar": ("bad.png", b"not an image", "image/png")},
            )
        ).json()["code"] == 1
        await session.refresh(row)
        assert row.avatar == urls[-1]
        public = (await client.get(f"/artist/getArtistDetail/{row.id}")).json()["data"]
        assert public["avatar"] == urls[-1]
    finally:
        for url in urls:
            await remove_avatar(
                Request({"type": "http", "app": account["app"]}), url.removeprefix("/media/")
            )


@pytest.mark.parametrize("batch", [False, True])
async def test_delete_artist_cascades_and_removes_only_unreferenced_media(
    account, admin, catalogue, batch
):
    token = await login(account, admin)
    session, client = account["session"], account["client"]
    artist = catalogue["artist"]
    song_ids = [song.id for song in catalogue["songs"]]
    style = Style(name="Style " + account["tag"])
    session.add(style)
    await session.flush()
    now = datetime.now()
    session.add_all(
        [
            Genre(song_id=song_ids[0], style_id=style.id),
            Favorite(user_id=account["user"].id, song_id=song_ids[0], type=0, create_time=now),
            Comment(
                user_id=account["user"].id,
                song_id=song_ids[0],
                type=0,
                content="test",
                create_time=now,
            ),
        ]
    )
    keys = [
        f"artists/test-{account['tag']}.png",
        f"covers/test-{account['tag']}.png",
        f"audio/test-{account['tag']}.wav",
    ]
    artist.avatar_key = keys[0]
    catalogue["songs"][0].cover_key = keys[1]
    catalogue["songs"][0].audio_key = keys[2]
    # A surviving playlist also uses this cover. Do not delete it.
    catalogue["playlist"].cover_key = keys[1]
    await session.commit()
    request = Request({"type": "http", "app": account["app"]})
    try:
        store = account["app"].state.media_store
        for key in keys:
            store.put_object(
                account["app"].state.settings.minio_bucket, key, io.BytesIO(b"demo"), 4
            )
        path = "/admin/deleteArtists" if batch else f"/admin/deleteArtist/{artist.id}"
        response = await client.request(
            "DELETE",
            path,
            headers=bearer(token),
            **({"json": [artist.id, artist.id, 999999999]} if batch else {}),
        )
        assert response.json()["message"] == "删除成功"
        assert await session.scalar(select(Artist.id).where(Artist.id == artist.id)) is None
        assert (
            await session.scalar(
                select(func.count()).select_from(Song).where(Song.id.in_(song_ids))
            )
            == 0
        )
        for model in (Genre, Favorite, Comment, PlaylistBinding):
            assert (
                await session.scalar(
                    select(func.count()).select_from(model).where(model.song_id.in_(song_ids))
                )
                == 0
            )
        for key, expected in zip(keys, (404, 200, 404), strict=True):
            assert (await client.get("/media/" + key)).status_code == expected
        missing = await client.request(
            "DELETE", path, headers=bearer(token), **({"json": [artist.id]} if batch else {})
        )
        assert missing.json()["message"] == ("删除失败" if batch else "歌手NOT_FOUND")
        assert (
            await client.request("DELETE", "/admin/deleteArtists", json=[], headers=bearer(token))
        ).json()["message"] == "删除失败"
    finally:
        for key in keys:
            await remove_avatar(request, key)


async def test_avatar_commit_failure_cleans_new_file_preserves_old(
    account, admin, catalogue, monkeypatch
):
    token = await login(account, admin)
    session = account["session"]
    await session.commit()
    store = account["app"].state.media_store
    put = store.put_object
    keys = []

    def track(bucket, key, *args, **kwargs):
        keys.append(key)
        return put(bucket, key, *args, **kwargs)

    async def fail():
        raise RuntimeError("commit failure")

    monkeypatch.setattr(store, "put_object", track)
    monkeypatch.setattr(session, "commit", fail)
    identity = catalogue["artist"].id
    with pytest.raises(RuntimeError, match="commit failure"):
        await account["client"].patch(
            f"/admin/updateArtistAvatar/{identity}",
            headers=bearer(token),
            files={"avatar": ("a.png", avatar_png())},
        )
    assert len(keys) == 1
    assert (await account["client"].get("/media/" + keys[0])).status_code == 404
    assert await session.scalar(select(Artist.avatar_key).where(Artist.id == identity)) is None


async def test_delete_commit_failure_preserves_database_and_media(
    account, admin, catalogue, monkeypatch
):
    session = account["session"]
    identity = catalogue["artist"].id
    await session.commit()
    removed = []
    monkeypatch.setattr(
        account["app"].state.media_store, "remove_object", lambda *args: removed.append(args)
    )

    async def fail():
        raise RuntimeError("delete commit failure")

    monkeypatch.setattr(session, "commit", fail)
    with pytest.raises(RuntimeError, match="delete commit failure"):
        await admin_artist.remove(
            session, Request({"type": "http", "app": account["app"]}), [identity]
        )
    assert await session.scalar(select(Artist.id).where(Artist.id == identity)) == identity
    assert (
        await session.scalar(
            select(func.count()).select_from(Song).where(Song.artist_id == identity)
        )
        == 2
    )
    assert removed == []
