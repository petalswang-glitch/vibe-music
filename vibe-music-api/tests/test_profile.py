import io
from datetime import date, datetime

import jwt
import pytest
from PIL import Image
from sqlalchemy import func, select
from starlette.requests import Request
from test_account import (
    SECRET,
    bearer,
    login,
)
from test_account import account as account

from app.models import Artist, Comment, Favorite, Feedback, Song, User
from app.services.avatar import remove_avatar


async def test_profile_updates_only_authenticated_user_and_preserves_session(account):
    token = await login(account)
    client = account["client"]
    body = {
        "userId": account["user"].id + 1,
        "username": "changed_" + account["tag"][:6],
        "email": account["email"],
        "phone": "",
        "introduction": "正在学习全栈开发",
    }
    assert (
        await client.put("/user/updateUserInfo", json=body, headers=bearer(token))
    ).status_code == 403
    body["userId"] = account["user"].id
    assert (await client.put("/user/updateUserInfo", json=body, headers=bearer(token))).json()[
        "code"
    ] == 0
    profile = (await client.get("/user/getUserInfo", headers=bearer(token))).json()["data"]
    assert profile["username"] == body["username"]
    assert profile["introduction"] == body["introduction"]
    assert profile["phone"] is None
    assert (await client.put("/user/updateUserInfo", json=body)).status_code == 401


@pytest.mark.parametrize(
    "field,value", [("username", "x"), ("phone", "123"), ("introduction", "a" * 101)]
)
async def test_profile_preserves_original_field_validation(account, field, value):
    token = await login(account)
    body = {"username": account["user"].username, "email": account["email"], field: value}
    response = await account["client"].put("/user/updateUserInfo", json=body, headers=bearer(token))
    assert response.json()["code"] == 1


async def test_profile_rejects_case_insensitive_duplicates(account):
    user = account["user"]
    second = User(
        username="other" + account["tag"],
        email="other" + account["email"],
        password=user.password,
        phone="13812345678",
        status=0,
        create_time=datetime.now(),
        update_time=datetime.now(),
    )
    account["session"].add(second)
    await account["session"].flush()
    token = await login(account)
    for field, value, message in [
        ("username", second.username.upper(), "用户名已存在"),
        ("email", second.email.upper(), "邮箱已存在"),
        ("phone", second.phone, "手机号已存在"),
    ]:
        body = {"username": user.username, "email": account["email"], field: value}
        response = await account["client"].put(
            "/user/updateUserInfo", json=body, headers=bearer(token)
        )
        assert response.json()["message"] == message


def avatar_png():
    output = io.BytesIO()
    Image.new("RGB", (80, 60), "coral").save(output, format="PNG")
    return output.getvalue()


async def test_avatar_real_minio_upload_replace_read_and_reject_nonimage(account):
    token = await login(account)
    client = account["client"]
    keys = []
    try:
        for _ in range(2):
            response = await client.patch(
                "/user/updateUserAvatar",
                headers=bearer(token),
                files={"avatar": ("../../avatar.svg", avatar_png(), "image/svg+xml")},
            )
            assert response.json()["code"] == 0
            profile = (await client.get("/user/getUserInfo", headers=bearer(token))).json()["data"]
            keys.append(profile["userAvatar"])
            assert keys[-1].startswith(f"/media/users/{account['user'].id}/")
            media = await client.get(keys[-1])
            assert media.status_code == 200
            assert media.headers["content-type"] == "image/png"
            with Image.open(io.BytesIO(media.content)) as image:
                assert image.size == (80, 60)
        assert keys[0] != keys[1]
        assert (await client.get(keys[0])).status_code == 404
        invalid = await client.patch(
            "/user/updateUserAvatar",
            headers=bearer(token),
            files={"avatar": ("avatar.png", b"<script>bad</script>", "image/png")},
        )
        assert invalid.json()["code"] == 1
        assert account["user"].user_avatar == keys[-1]
        assert (
            await client.patch("/user/updateUserAvatar", files={"avatar": ("a.png", avatar_png())})
        ).status_code == 401
        deleted = await client.delete("/user/deleteAccount", headers=bearer(token))
        assert deleted.json()["code"] == 0
        assert (await client.get(keys[-1])).status_code == 404
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
        await account["redis"].delete(
            f"auth:session:ROLE_USER:{payload['claims']['userId']}:{payload['jti']}"
        )
    finally:
        for path in keys:
            await remove_avatar(
                Request({"type": "http", "app": account["app"]}), path.removeprefix("/media/")
            )


async def test_delete_account_cascades_owned_data_and_invalidates_all_sessions(account):
    tokens = [await login(account), await login(account)]
    session = account["session"]
    identity = account["user"].id
    artist = Artist(name="注销隔离测试歌手")
    session.add(artist)
    await session.flush()
    song = Song(
        artist_id=artist.id, name="注销隔离测试歌曲", album="隔离测试", release_time=date.today()
    )
    session.add(song)
    await session.flush()
    now = datetime.now()
    session.add_all(
        [
            Favorite(user_id=identity, song_id=song.id, type=0, create_time=now),
            Comment(user_id=identity, song_id=song.id, content="test", type=0, create_time=now),
            Feedback(user_id=identity, feedback="test", create_time=now),
        ]
    )
    await session.flush()
    response = await account["client"].delete("/user/deleteAccount", headers=bearer(tokens[0]))
    assert response.json()["message"] == "删除成功"
    for model in (Favorite, Comment, Feedback):
        assert (
            await session.scalar(
                select(func.count()).select_from(model).where(model.user_id == identity)
            )
            == 0
        )
    assert await session.get(User, identity) is None
    assert await session.get(Song, song.id) is not None
    for token in tokens:
        assert (
            await account["client"].get("/user/getUserInfo", headers=bearer(token))
        ).status_code == 401
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
        # A deleted account is denied even if its Redis entry survives to TTL.
        await account["redis"].delete(f"auth:session:ROLE_USER:{identity}:{payload['jti']}")


async def test_avatar_upload_failure_does_not_change_profile(account, monkeypatch):
    token = await login(account)

    def unavailable(*args, **kwargs):
        raise OSError("isolated storage failure")

    monkeypatch.setattr(account["app"].state.media_store, "put_object", unavailable)
    response = await account["client"].patch(
        "/user/updateUserAvatar",
        headers=bearer(token),
        files={"avatar": ("avatar.png", avatar_png(), "image/png")},
    )
    assert response.status_code == 502
    assert account["user"].avatar_key is None


async def test_avatar_commit_failure_removes_new_object(account, monkeypatch):
    token = await login(account)
    store = account["app"].state.media_store
    put_object = store.put_object
    keys = []

    def track_upload(bucket, key, *args, **kwargs):
        keys.append(key)
        return put_object(bucket, key, *args, **kwargs)

    async def fail_commit():
        raise RuntimeError("isolated commit failure")

    monkeypatch.setattr(store, "put_object", track_upload)
    monkeypatch.setattr(account["session"], "commit", fail_commit)
    with pytest.raises(RuntimeError, match="isolated commit failure"):
        await account["client"].patch(
            "/user/updateUserAvatar",
            headers=bearer(token),
            files={"avatar": ("avatar.png", avatar_png(), "image/png")},
        )
    assert len(keys) == 1
    assert (await account["client"].get(f"/media/{keys[0]}")).status_code == 404
