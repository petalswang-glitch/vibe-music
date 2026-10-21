import io

import pytest
from PIL import Image
from sqlalchemy import select
from starlette.requests import Request
from test_account import account as account
from test_account import bearer
from test_account import login as user_login
from test_admin import admin as admin
from test_admin import login

from app.models import Banner, Playlist
from app.services import admin_banner
from app.services.avatar import remove_avatar


def banner_png():
    output = io.BytesIO()
    Image.new("RGB", (1080, 420), "#3388cc").save(output, format="PNG")
    return output.getvalue()


async def test_banner_listing_filters_enums_order_empty_and_public_top_nine(account, admin):
    headers = bearer(await login(account, admin))
    client, session = account["client"], account["session"]
    rows = [Banner(banner_url=f"/media/test/{i}.png", status=0) for i in range(11)]
    disabled = Banner(banner_url="/media/disabled.png", status=1)
    session.add_all([*rows, disabled])
    await session.commit()
    query = {"pageNum": 1, "pageSize": 5}
    result = await client.post("/admin/getAllBanners", json=query, headers=headers)
    assert result.headers["cache-control"] == "private, no-store"
    data = result.json()["data"]
    assert data["total"] == 12 and len(data["items"]) == 5
    assert data["items"][0] == {
        "bannerId": disabled.id,
        "bannerUrl": disabled.banner_url,
        "bannerStatus": "DISABLE",
    }
    for value in (0, "ENABLE", "0"):
        data = (
            await client.post(
                "/admin/getAllBanners", json={**query, "bannerStatus": value}, headers=headers
            )
        ).json()["data"]
        assert data["total"] == 11 and data["items"][0]["bannerStatus"] == "ENABLE"
    public = (await client.get("/banner/getBannerList")).json()["data"]
    assert [b["bannerId"] for b in public] == [b.id for b in rows[-9:][::-1]]
    assert set(public[0]) == {"bannerId", "bannerUrl"}
    assert (
        await client.post("/admin/getAllBanners", json={**query, "pageNum": 99}, headers=headers)
    ).json()["data"] == {"total": 0, "items": None}


async def test_banner_permissions_and_validation(account, admin):
    headers = bearer(await login(account, admin))
    user = bearer(await user_login(account))
    client = account["client"]
    for method, path, kwargs in [
        ("POST", "/admin/getAllBanners", {"json": {"pageNum": 1, "pageSize": 5}}),
        ("POST", "/admin/addBanner", {"files": {"banner": ("b.png", banner_png())}}),
        ("PATCH", "/admin/updateBanner/1", {"files": {"banner": ("b.png", banner_png())}}),
        ("PATCH", "/admin/updateBannerStatus/1?status=0", {}),
        ("DELETE", "/admin/deleteBanner/1", {}),
        ("DELETE", "/admin/deleteBanners", {"json": [1]}),
    ]:
        for auth, status in [({}, 401), (user, 403)]:
            assert (
                await client.request(method, path, headers=auth, **kwargs)
            ).status_code == status
    for body in (
        {"pageNum": 0, "pageSize": 5},
        {"pageNum": 1, "pageSize": 101},
        {"pageNum": 1, "pageSize": 5, "bannerStatus": 2},
    ):
        assert (
            await client.post("/admin/getAllBanners", json=body, headers=headers)
        ).status_code == 422


async def test_banner_upload_replace_status_and_delete_media(account, admin):
    headers = bearer(await login(account, admin))
    client, session = account["client"], account["session"]
    request = Request({"type": "http", "app": account["app"]})
    keys = []
    try:
        assert (
            await client.post(
                "/admin/addBanner", files={"banner": ("b.png", banner_png())}, headers=headers
            )
        ).json()["message"] == "添加成功"
        row = await session.scalar(select(Banner))
        identity = row.id
        assert row.status == 0
        keys.append(row.banner_key)
        media = await client.get(row.banner_url)
        assert media.status_code == 200
        assert Image.open(io.BytesIO(media.content)).size == (1080, 420)
        assert (
            await client.patch(
                f"/admin/updateBanner/{identity}",
                files={"banner": ("b.png", banner_png())},
                headers=headers,
            )
        ).json()["code"] == 0
        await session.refresh(row)
        keys.append(row.banner_key)
        assert keys[0] != keys[1] and (await client.get("/media/" + keys[0])).status_code == 404
        assert (
            await client.patch(f"/admin/updateBannerStatus/{identity}?status=1", headers=headers)
        ).json()["message"] == "更新成功"
        assert (await client.get("/banner/getBannerList")).json()["data"] == []
        assert (
            await client.patch(f"/admin/updateBannerStatus/{identity}?status=0", headers=headers)
        ).json()["code"] == 0
        assert len((await client.get("/banner/getBannerList")).json()["data"]) == 1
        assert (
            await client.patch(f"/admin/updateBannerStatus/{identity}?status=2", headers=headers)
        ).json()["message"] == "轮播图状态无效"
        assert (
            await client.patch(
                f"/admin/updateBanner/{identity}",
                files={"banner": ("b.png", b"invalid")},
                headers=headers,
            )
        ).json()["message"] == "请选择有效的轮播图图片"
        assert (await client.delete(f"/admin/deleteBanner/{identity}", headers=headers)).json()[
            "message"
        ] == "删除成功"
        assert (await client.get("/media/" + keys[1])).status_code == 404
        assert (await client.delete(f"/admin/deleteBanner/{identity}", headers=headers)).json()[
            "message"
        ] == "未找到相关数据"
        assert (
            await client.patch(
                f"/admin/updateBanner/{identity}",
                files={"banner": ("b.png", banner_png())},
                headers=headers,
            )
        ).json()["message"] == "更新失败"
    finally:
        for key in keys:
            await remove_avatar(request, key)


async def test_banner_batch_delete_keeps_shared_media_and_other_entities(account, admin):
    headers = bearer(await login(account, admin))
    client, session = account["client"], account["session"]
    key = "banners/shared-" + account["tag"] + ".png"
    row = Banner(banner_url="/media/" + key, banner_key=key, status=0)
    other = Playlist(title="shared", cover_key=key)
    session.add_all([row, other])
    await session.commit()
    identity = row.id
    request = Request({"type": "http", "app": account["app"]})
    account["app"].state.media_store.put_object(
        account["app"].state.settings.minio_bucket, key, io.BytesIO(b"shared"), 6
    )
    try:
        assert (
            await client.request(
                "DELETE",
                "/admin/deleteBanners",
                json=[identity, identity, 999999999],
                headers=headers,
            )
        ).json()["code"] == 0
        assert (await client.get("/media/" + key)).status_code == 200
        assert await session.scalar(select(Playlist.id).where(Playlist.id == other.id)) == other.id
        assert (
            await client.request("DELETE", "/admin/deleteBanners", json=[], headers=headers)
        ).json()["message"] == "删除失败"
    finally:
        await remove_avatar(request, key)


@pytest.mark.parametrize("edit", [False, True])
async def test_banner_upload_commit_failure_compensates(account, admin, monkeypatch, edit):
    headers = bearer(await login(account, admin))
    session = account["session"]
    row = Banner(banner_url="/media/original.png", status=0)
    session.add(row)
    await session.commit()
    identity = row.id
    store = account["app"].state.media_store
    put, keys = store.put_object, []

    def track(bucket, key, *args, **kwargs):
        keys.append(key)
        return put(bucket, key, *args, **kwargs)

    async def fail():
        raise RuntimeError("banner commit failure")

    monkeypatch.setattr(store, "put_object", track)
    monkeypatch.setattr(session, "commit", fail)
    with pytest.raises(RuntimeError, match="banner commit failure"):
        await account["client"].request(
            "PATCH" if edit else "POST",
            f"/admin/updateBanner/{identity}" if edit else "/admin/addBanner",
            headers=headers,
            files={"banner": ("b.png", banner_png())},
        )
    assert len(keys) == 1 and (await account["client"].get("/media/" + keys[0])).status_code == 404
    assert (
        await session.scalar(select(Banner).where(Banner.id == identity))
    ).banner_url == "/media/original.png"


async def test_banner_delete_failure_restores_row(account, monkeypatch):
    session = account["session"]
    row = Banner(banner_url="/media/original.png", status=0)
    session.add(row)
    await session.commit()
    identity = row.id

    async def fail():
        raise RuntimeError("delete commit failure")

    monkeypatch.setattr(session, "commit", fail)
    with pytest.raises(RuntimeError, match="delete commit failure"):
        await admin_banner.remove(
            session, Request({"type": "http", "app": account["app"]}), [identity]
        )
    assert await session.scalar(select(Banner.id).where(Banner.id == identity)) == identity
