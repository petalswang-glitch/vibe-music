from datetime import datetime

import pytest
from sqlalchemy import select
from test_account import account as account
from test_account import bearer, login
from test_favorite import catalogue as catalogue
from test_favorite import other_identity

from app.models import Comment, Feedback


@pytest.mark.parametrize("kind", ["Song", "Playlist"])
async def test_comment_add_detail_delete_and_owner_check(account, catalogue, kind):
    token = await login(account)
    _, other_token = await other_identity(account)
    target_id = catalogue["songs"][0].id if kind == "Song" else catalogue["playlist"].id
    body = {f"{kind.lower()}Id": target_id, "content": "<script>plain text</script> 音乐评论"}
    client = account["client"]
    path = f"/comment/add{kind}Comment"
    assert (await client.post(path, json=body)).status_code == 401
    assert (await client.post(path, json=body, headers=bearer(token))).json() == {
        "code": 0,
        "message": "添加成功",
        "data": None,
    }
    row = await account["session"].scalar(
        select(Comment).where(Comment.user_id == account["user"].id)
    )
    assert row.type == (0 if kind == "Song" else 1)
    assert row.user_id == account["user"].id and row.like_count == 0
    detail_path = f"/{kind.lower()}/get{kind}Detail/{target_id}"
    response = (await client.get(detail_path)).json()["data"]["comments"]
    assert len(response) == 1 and response[0]["content"] == body["content"]
    assert set(response[0]) == {
        "commentId",
        "username",
        "userAvatar",
        "content",
        "createTime",
        "likeCount",
    }
    assert response[0]["createTime"] == datetime.now().date().isoformat()
    delete = f"/comment/deleteComment/{row.id}"
    assert (await client.delete(delete)).status_code == 401
    denied = await client.delete(delete, headers=bearer(other_token))
    assert denied.json() == {"code": 1, "message": "您没有权限访问此资源", "data": None}
    assert (await client.delete(delete, headers=bearer(token))).json()["message"] == "删除成功"
    assert (await client.get(detail_path)).json()["data"]["comments"] == []
    assert (await client.delete(delete, headers=bearer(token))).json()["message"] == "NOT_FOUND"


async def test_like_counter_repeats_null_cancel_and_missing(account, catalogue):
    token = await login(account)
    _, other_token = await other_identity(account)
    row = Comment(
        user_id=account["user"].id,
        song_id=catalogue["songs"][0].id,
        type=0,
        content="Counter",
        create_time=datetime.now(),
        like_count=None,
    )
    session, client = account["session"], account["client"]
    session.add(row)
    await session.flush()
    like = f"/comment/likeComment/{row.id}"
    cancel = f"/comment/cancelLikeComment/{row.id}"
    assert (await client.patch(like)).status_code == 401
    for identity in (token, token, other_token):
        assert (await client.patch(like, headers=bearer(identity))).json()["message"] == "成功"
    await session.refresh(row)
    assert row.like_count == 3
    for _ in range(4):
        assert (await client.patch(cancel, headers=bearer(token))).json()["code"] == 0
    await session.refresh(row)
    assert row.like_count == -1  # Legacy API is a counter, not a per-user like ledger.
    assert (await client.patch("/comment/likeComment/999999999", headers=bearer(token))).json()[
        "message"
    ] == "NOT_FOUND"
    assert (
        await client.patch("/comment/cancelLikeComment/999999999", headers=bearer(token))
    ).json()["message"] == "NOT_FOUND"


@pytest.mark.parametrize("kind", ["Song", "Playlist"])
async def test_comment_input_target_failure_and_identity_not_from_body(account, catalogue, kind):
    token = await login(account)
    other, _ = await other_identity(account)
    client = account["client"]
    url = f"/comment/add{kind}Comment"
    headers = bearer(token)
    target = catalogue["songs"][0].id if kind == "Song" else catalogue["playlist"].id
    body = {f"{kind.lower()}Id": target, "content": "a" * 255, "userId": other.id}
    assert (await client.post(url, json=body, headers=headers)).json()["code"] == 0
    owner = await account["session"].scalar(
        select(Comment.user_id).where(Comment.content == "a" * 255)
    )
    assert owner == account["user"].id
    assert (
        await client.post(url, json={**body, "content": "a" * 256}, headers=headers)
    ).status_code == 422
    assert (
        await client.post(url, json={"content": "Missing target"}, headers=headers)
    ).status_code == 422
    assert (
        await client.post(url, json={**body, f"{kind.lower()}Id": 999999999}, headers=headers)
    ).json()["message"] == "添加失败"


async def test_feedback_is_query_parameter_authenticated_and_persisted(account):
    token = await login(account)
    client, session = account["client"], account["session"]
    url = "/feedback/addFeedback"
    params = {"content": "音乐体验反馈 & 编码 + % = 不应丢失"}
    assert (await client.post(url, params=params)).status_code == 401
    assert (await client.post(url, params=params, headers=bearer(token))).json()[
        "message"
    ] == "添加成功"
    row = await session.scalar(select(Feedback).where(Feedback.user_id == account["user"].id))
    assert row.feedback == params["content"] and row.create_time is not None
    assert (await client.post(url, json=params, headers=bearer(token))).status_code == 422
    assert (
        await client.post(url, params={"content": "x" * 256}, headers=bearer(token))
    ).status_code == 422


async def test_locked_and_invalid_user_cannot_write_community(account, catalogue):
    token = await login(account)
    user = account["user"]
    user.status = 1
    await account["session"].flush()
    actions = [
        (
            "POST",
            "/comment/addSongComment",
            {"json": {"songId": catalogue["songs"][0].id, "content": "blocked"}},
        ),
        (
            "POST",
            "/comment/addPlaylistComment",
            {"json": {"playlistId": catalogue["playlist"].id, "content": "blocked"}},
        ),
        ("PATCH", "/comment/likeComment/1", {}),
        ("PATCH", "/comment/cancelLikeComment/1", {}),
        ("DELETE", "/comment/deleteComment/1", {}),
        ("POST", "/feedback/addFeedback", {"params": {"content": "blocked"}}),
    ]
    for method, path, kwargs in actions:
        assert (
            await account["client"].request(method, path, headers=bearer(token), **kwargs)
        ).status_code == 403
        assert (
            await account["client"].request(method, path, headers=bearer("invalid"), **kwargs)
        ).status_code == 401
