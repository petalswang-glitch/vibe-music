from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.sql.dml import Delete
from test_account import PASSWORD, bearer
from test_account import account as account
from test_account import login as user_login
from test_admin import admin as admin
from test_admin import login
from test_favorite import catalogue as catalogue
from test_favorite import other_identity

from app.models import Comment, Favorite, Feedback, User
from app.services import admin_user


def body(account, **changes):
    return {
        "username": "new" + account["tag"],
        "email": "new_" + account["email"],
        "password": PASSWORD,
        "phone": "",
        "introduction": "测试简介",
        "userStatus": 1,
        "userId": "",
        **changes,
    }


@pytest.mark.parametrize("value,stored", [(1, 0), (0, 1), ("DISABLE", 0), ("ENABLE", 1)])
async def test_create_preserves_legacy_status_inversion_and_login(account, admin, value, stored):
    token = await login(account, admin)
    payload = body(account, userStatus=value)
    account["emails"].add(payload["email"])
    result = await account["client"].post("/admin/addUser", json=payload, headers=bearer(token))
    assert result.status_code == 200 and result.json()["message"] == "添加成功"
    row = await account["session"].scalar(select(User).where(User.email == payload["email"]))
    assert row.status == stored and row.phone is None
    assert row.password.startswith("$argon2id$") and row.introduction == payload["introduction"]
    response = await account["client"].post(
        "/user/login", json={"email": payload["email"], "password": PASSWORD}
    )
    assert response.json()["code"] == stored


async def test_user_list_filters_allowlist_enum_date_and_order(account, admin):
    token = await login(account, admin)
    user = account["user"]
    user.phone = "13800138000"
    now = datetime.now().replace(microsecond=0)
    user.create_time = now
    other = User(
        username="other" + account["tag"],
        email="other_" + account["email"],
        password=user.password,
        phone="13900139000",
        status=1,
        create_time=now + timedelta(seconds=1),
        update_time=now,
    )
    account["emails"].add(other.email)
    account["session"].add(other)
    await account["session"].flush()
    client = account["client"]
    headers = bearer(token)
    count = await client.get("/admin/getAllUsersCount", headers=headers)
    assert count.json()["data"] == 2 and count.headers["cache-control"] == "private, no-store"
    query = {"pageNum": 1, "pageSize": 10}
    listing = await client.post("/admin/getAllUsers", json=query, headers=headers)
    assert listing.headers["cache-control"] == "private, no-store"
    rows = listing.json()["data"]["items"]
    assert [r["userId"] for r in rows] == [other.id, user.id]
    assert rows[0]["userStatus"] == "DISABLE" and rows[1]["userStatus"] == "ENABLE"
    assert set(rows[0]) == {
        "userId",
        "username",
        "phone",
        "email",
        "userAvatar",
        "introduction",
        "createTime",
        "updateTime",
        "userStatus",
    }
    assert rows[0]["updateTime"] == now.isoformat()
    filtered = (
        await client.post(
            "/admin/getAllUsers",
            json={**query, "username": user.username.upper(), "phone": "138", "userStatus": "0"},
            headers=headers,
        )
    ).json()["data"]
    assert filtered["total"] == 1 and filtered["items"][0]["userId"] == user.id
    empty = (
        await client.post("/admin/getAllUsers", json={**query, "pageNum": 99}, headers=headers)
    ).json()
    assert empty["data"] == {"total": 0, "items": None} and empty["message"] == "未找到相关数据"


async def test_edit_and_unique_fields_do_not_overwrite_password_or_status(account, admin):
    token = await login(account, admin)
    client, session = account["client"], account["session"]
    payload = body(account, phone="13800138000")
    account["emails"].add(payload["email"])
    await client.post("/admin/addUser", json=payload, headers=bearer(token))
    row = await session.scalar(select(User).where(User.email == payload["email"]))
    stored = row.password
    for changes, label in [
        ({"username": row.username.upper()}, "用户名"),
        ({"phone": row.phone}, "手机号"),
        ({"email": row.email.upper()}, "邮箱"),
    ]:
        candidate = body(
            account,
            username="dup" + account["tag"],
            email="dup_" + account["email"],
            **{k: v for k, v in changes.items() if k not in ("username", "email")},
        )
        candidate.update(changes)
        result = await client.post("/admin/addUser", json=candidate, headers=bearer(token))
        assert result.json()["message"] == f"{label}已存在"
    edit = {
        "userId": row.id,
        "username": row.username,
        "email": row.email,
        "phone": "",
        "introduction": "改后简介",
        "password": "overwrite!",
        "userStatus": 0,
    }
    assert (await client.put("/admin/updateUser", json=edit, headers=bearer(token))).json()[
        "message"
    ] == "更新成功"
    await session.refresh(row)
    assert (
        row.phone is None
        and row.introduction == "改后简介"
        and row.password == stored
        and row.status == 0
    )
    assert (
        await client.put(
            "/admin/updateUser", json={**edit, "email": account["email"]}, headers=bearer(token)
        )
    ).json()["message"] == "邮箱已存在"
    assert (
        await client.put(
            "/admin/updateUser", json={**edit, "userId": 999999999}, headers=bearer(token)
        )
    ).json()["message"] == "更新失败"


async def test_disable_rejects_existing_user_session_and_reenable_restores_access(account, admin):
    token = await login(account, admin)
    user_token = await user_login(account)
    client = account["client"]
    user = account["user"]
    path = f"/admin/updateUserStatus/{user.id}"
    assert (await client.patch(path + "/1", headers=bearer(token))).json()["message"] == "更新成功"
    assert (await client.get("/user/getUserInfo", headers=bearer(user_token))).status_code == 403
    assert (await client.patch(path + "/0", headers=bearer(token))).json()["code"] == 0
    assert (await client.get("/user/getUserInfo", headers=bearer(user_token))).status_code == 200
    assert (await client.patch(path + "/2", headers=bearer(token))).json()[
        "message"
    ] == "用户状态无效"
    assert (
        await client.patch("/admin/updateUserStatus/999999999/0", headers=bearer(token))
    ).json()["message"] == "更新失败"


async def test_user_management_permissions_and_validation(account, admin):
    token = await login(account, admin)
    user = await user_login(account)
    client = account["client"]
    for method, path, kwargs in [
        ("GET", "/admin/getAllUsersCount", {}),
        ("POST", "/admin/getAllUsers", {"json": {"pageNum": 1, "pageSize": 15}}),
        ("POST", "/admin/addUser", {"json": body(account)}),
        (
            "PUT",
            "/admin/updateUser",
            {
                "json": {
                    "userId": account["user"].id,
                    "username": account["user"].username,
                    "email": account["email"],
                }
            },
        ),
        ("PATCH", f"/admin/updateUserStatus/{account['user'].id}/0", {}),
        ("DELETE", f"/admin/deleteUser/{account['user'].id}", {}),
        ("DELETE", "/admin/deleteUsers", {"json": [account["user"].id]}),
    ]:
        assert (await client.request(method, path, **kwargs)).status_code == 401
        assert (
            await client.request(method, path, headers=bearer(user), **kwargs)
        ).status_code == 403
    for changes in (
        {"password": "12345678"},
        {"phone": "123"},
        {"email": "invalid"},
        {"introduction": "x" * 101},
        {"userStatus": 2},
    ):
        assert (
            await client.post(
                "/admin/addUser", json=body(account, **changes), headers=bearer(token)
            )
        ).status_code == 422


@pytest.mark.parametrize("batch", [False, True])
async def test_delete_account_feedback_cascades_and_rejects_old_login(
    account, admin, catalogue, batch
):
    token = await login(account, admin)
    user_token = await user_login(account)
    other, other_token = await other_identity(account)
    session, client = account["session"], account["client"]
    user_id, other_id = account["user"].id, other.id
    now = datetime.now()
    song_id = catalogue["songs"][0].id
    session.add_all(
        [
            Feedback(user_id=identity, feedback="删除事务测试", create_time=now)
            for identity in (user_id, other_id)
        ]
        + [
            Comment(user_id=user_id, song_id=song_id, type=0, content="评论", create_time=now),
            Favorite(user_id=user_id, song_id=song_id, type=0, create_time=now),
        ]
    )
    await session.commit()
    target = "/admin/deleteUsers" if batch else f"/admin/deleteUser/{user_id}"
    ids = [user_id, user_id, 999999999]  # Existing IDs succeed even with duplicates/missing IDs.
    response = await client.request(
        "DELETE", target, headers=bearer(token), **({"json": ids} if batch else {})
    )
    assert response.json() == {"code": 0, "message": "删除成功", "data": None}
    for model in (Feedback, Comment, Favorite):
        assert (
            await session.scalar(
                select(func.count()).select_from(model).where(model.user_id == user_id)
            )
            == 0
        )
    assert await session.scalar(select(User.id).where(User.id == user_id)) is None
    assert (
        await session.scalar(select(Feedback.user_id).where(Feedback.user_id == other_id))
        == other_id
    )
    assert (await client.get("/user/getUserInfo", headers=bearer(user_token))).status_code == 401
    assert (await client.get("/user/getUserInfo", headers=bearer(other_token))).status_code == 200
    assert (
        await client.request(
            "DELETE", target, headers=bearer(token), **({"json": ids} if batch else {})
        )
    ).json()["message"] == "删除失败"
    assert (
        await client.request("DELETE", "/admin/deleteUsers", json=[], headers=bearer(token))
    ).json()["message"] == "删除失败"
    assert (
        await client.request("DELETE", "/admin/deleteUsers", json=[2**63], headers=bearer(token))
    ).status_code == 422
    keys = [
        key async for key in account["redis"].scan_iter(match=f"auth:session:ROLE_USER:{user_id}:*")
    ]
    if keys:
        await account["redis"].delete(*keys)


async def test_delete_failure_rolls_back_feedback_and_account(account, monkeypatch):
    session = account["session"]
    identity = account["user"].id
    session.add(Feedback(user_id=identity, feedback="保留反馈", create_time=datetime.now()))
    await session.commit()
    execute = session.execute

    async def fail_account_delete(statement, *args, **kwargs):
        if isinstance(statement, Delete) and statement.table.name == "tb_user":
            raise RuntimeError("simulated account-delete failure")
        return await execute(statement, *args, **kwargs)

    monkeypatch.setattr(session, "execute", fail_account_delete)
    with pytest.raises(RuntimeError, match="simulated"):
        await admin_user.remove(session, [identity])
    assert await session.scalar(select(User.id).where(User.id == identity)) == identity
    assert (
        await session.scalar(select(Feedback.feedback).where(Feedback.user_id == identity))
        == "保留反馈"
    )
