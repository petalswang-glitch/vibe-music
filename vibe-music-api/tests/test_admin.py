import hashlib
from datetime import datetime, timedelta
from unittest.mock import AsyncMock

import jwt
import pytest_asyncio
from redis.exceptions import ConnectionError
from sqlalchemy import select
from test_account import SECRET, bearer
from test_account import account as account
from test_account import login as user_login

from app.core.security import hash_password
from app.models import Admin, Feedback

PASSWORD = "Admin1234!"


@pytest_asyncio.fixture
async def admin(account):
    row = Admin(
        username="adm" + account["tag"],
        password=hashlib.md5(PASSWORD.encode(), usedforsecurity=False).hexdigest(),
    )
    account["session"].add(row)
    await account["session"].flush()
    identity = row.id
    try:
        yield row
    finally:
        keys = [
            key
            async for key in account["redis"].scan_iter(
                match=f"auth:session:ROLE_ADMIN:{identity}:*"
            )
        ]
        if keys:
            await account["redis"].delete(*keys)


async def login(account, admin):
    response = await account["client"].post(
        "/admin/login", json={"username": admin.username.upper(), "password": PASSWORD}
    )
    assert response.status_code == 200 and response.json()["code"] == 0
    return response.json()["data"]


async def test_admin_login_upgrade_claims_session_and_logout(account, admin):
    token = await login(account, admin)
    another = await login(account, admin)
    assert token != another and admin.password.startswith("$argon2id$")
    payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    assert payload["exp"] - payload["iat"] == 21600
    assert payload["claims"] == {
        "role": "ROLE_ADMIN",
        "adminId": admin.id,
        "username": admin.username,
    }
    probe = await account["client"].get("/admin/session", headers={"authorization": token})
    assert probe.headers["cache-control"] == "private, no-store"
    assert probe.json()["data"] == {"adminId": admin.id, "username": admin.username}
    assert (await account["client"].post("/admin/logout", headers=bearer(token))).json()[
        "message"
    ] == "登出成功"
    assert (await account["client"].get("/admin/session", headers=bearer(token))).status_code == 401
    assert (
        await account["client"].get("/admin/session", headers=bearer(another))
    ).status_code == 200


async def test_admin_user_roles_cannot_cross_boundaries(account, admin):
    token = await login(account, admin)
    user = await user_login(account)
    for method, path, kwargs in [
        ("GET", "/admin/session", {}),
        ("POST", "/admin/logout", {}),
        ("POST", "/admin/getAllFeedbacks", {"json": {"pageNum": 1, "pageSize": 20}}),
        ("DELETE", "/admin/deleteFeedback/1", {}),
        ("DELETE", "/admin/deleteFeedbacks", {"json": [1]}),
    ]:
        for headers, code in [({}, 401), (bearer("invalid"), 401), (bearer(user), 403)]:
            assert (
                await account["client"].request(method, path, headers=headers, **kwargs)
            ).status_code == code
    assert (
        await account["client"].get("/user/getUserInfo", headers=bearer(token))
    ).status_code == 403
    assert (
        await account["client"].post(
            "/feedback/addFeedback", params={"content": "wrong role"}, headers=bearer(token)
        )
    ).status_code == 403
    # Logging out admin does not revoke the ordinary user's independent session.
    await account["client"].post("/admin/logout", headers=bearer(token))
    assert (
        await account["client"].get("/user/getUserInfo", headers=bearer(user))
    ).status_code == 200


async def test_invalid_credentials_validation_and_no_admin_registration(account, admin):
    client = account["client"]
    for body, expected in [
        ({"username": "missing_admin", "password": PASSWORD}, "用户名错误"),
        ({"username": admin.username, "password": "Wrong1234!"}, "密码错误"),
        ({"username": "x", "password": PASSWORD}, "用户名格式不正确"),
        ({"username": admin.username, "password": "12345678"}, "密码格式不正确"),
        ({"username": admin.username}, "密码不能为空"),
    ]:
        response = await client.post("/admin/login", json=body)
        assert response.status_code == 200 and response.json()["message"] == expected
        assert response.json()["code"] == 1
    assert (
        await client.post("/admin/register", json={"username": "new_admin", "password": PASSWORD})
    ).status_code == 404


async def test_password_change_missing_session_and_deleted_admin_reject_old_token(account, admin):
    token = await login(account, admin)
    admin.password = await hash_password("Changed123!")
    await account["session"].flush()
    assert (await account["client"].get("/admin/session", headers=bearer(token))).status_code == 401
    admin.password = await hash_password(PASSWORD)
    await account["session"].flush()
    token = await login(account, admin)
    await account["session"].delete(admin)
    await account["session"].flush()
    assert (await account["client"].get("/admin/session", headers=bearer(token))).status_code == 401


async def test_feedback_contract_filter_order_empty_and_deletion(account, admin):
    token = await login(account, admin)
    headers = bearer(token)
    session, client = account["session"], account["client"]
    now = datetime.now().replace(microsecond=0)
    rows = [
        Feedback(
            user_id=account["user"].id, feedback=value, create_time=now + timedelta(seconds=index)
        )
        for index, value in enumerate(["Café Music", "another", "CAFE Test"])
    ]
    session.add_all(rows)
    await session.flush()
    body = {"pageNum": 1, "pageSize": 1, "keyword": "cafe"}
    page = await client.post("/admin/getAllFeedbacks", json=body, headers=headers)
    assert page.headers["cache-control"] == "private, no-store"
    data = page.json()["data"]
    assert data["total"] == 2 and data["items"][0] == {
        "feedbackId": rows[2].id,
        "userId": account["user"].id,
        "feedback": "CAFE Test",
        "createTime": rows[2].create_time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    empty = (
        await client.post("/admin/getAllFeedbacks", json={**body, "pageNum": 99}, headers=headers)
    ).json()
    assert empty["message"] == "未找到相关数据" and empty["data"] == {"total": 0, "items": None}
    assert (await client.delete(f"/admin/deleteFeedback/{rows[0].id}", headers=headers)).json()[
        "message"
    ] == "删除成功"
    assert (await client.delete(f"/admin/deleteFeedback/{rows[0].id}", headers=headers)).json()[
        "message"
    ] == "删除失败"
    assert (
        await client.request(
            "DELETE",
            "/admin/deleteFeedbacks",
            json=[rows[1].id, 999999999, rows[2].id],
            headers=headers,
        )
    ).json()["message"] == "删除成功"
    assert (await session.scalars(select(Feedback))).all() == []
    assert (
        await client.request("DELETE", "/admin/deleteFeedbacks", json=[], headers=headers)
    ).json()["message"] == "删除失败"


async def test_admin_cache_outage_is_not_successful_authentication(account, admin, monkeypatch):
    token = await login(account, admin)
    monkeypatch.setattr(account["redis"], "get", AsyncMock(side_effect=ConnectionError("offline")))
    response = await account["client"].get("/admin/session", headers=bearer(token))
    assert response.status_code == 503
    assert response.json()["message"] == "会话服务暂时不可用"


async def test_admin_claims_do_not_reuse_user_session_or_accept_invalid_identity(account, admin):
    user_token = await user_login(account)
    original = jwt.decode(user_token, SECRET, algorithms=["HS256"])
    for identity in (admin.id, True, 0, 2**64):
        payload = {**original, "claims": {"role": "ROLE_ADMIN", "adminId": identity}}
        token = jwt.encode(payload, SECRET, algorithm="HS256")
        response = await account["client"].get("/admin/session", headers=bearer(token))
        assert response.status_code == 401


async def test_feedback_integer_boundaries_reject_before_database_query(account, admin):
    headers = bearer(await login(account, admin))
    client = account["client"]
    assert (
        await client.post(
            "/admin/getAllFeedbacks", json={"pageNum": 1, "pageSize": 2**31}, headers=headers
        )
    ).status_code == 422
    assert (
        await client.delete(f"/admin/deleteFeedback/{2**63}", headers=headers)
    ).status_code == 422
    assert (
        await client.request("DELETE", "/admin/deleteFeedbacks", json=[2**63], headers=headers)
    ).status_code == 422
