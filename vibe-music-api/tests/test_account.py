import asyncio
import hashlib
import os
import secrets
from datetime import datetime

import httpx
import jwt
import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from redis.asyncio import Redis
from sqlalchemy import select
from starlette.requests import Request

from app.core.config import Settings
from app.core.security import BusinessError
from app.db.session import get_session
from app.main import create_app
from app.models import User
from app.services.auth import code_digest, consume_code, email_key, issue_token

PASSWORD = "Legacy123!"
NEW_PASSWORD = "Updated456!"
SECRET = "isolated-test-key-at-least-32-characters-long"


@pytest_asyncio.fixture
async def account(database_session):
    tag = secrets.token_hex(5)
    email = f"tester{tag}@example.com"
    now = datetime.now()
    user = User(
        username=f"user{tag}",
        email=email,
        password=hashlib.md5(PASSWORD.encode(), usedforsecurity=False).hexdigest(),
        create_time=now,
        update_time=now,
        status=0,
    )
    database_session.add(user)
    await database_session.flush()
    app = create_app(
        Settings(
            auth_secret=SECRET,
            redis_url="redis://127.0.0.1:26379/15",
            agent_key_encryption_key=Fernet.generate_key().decode(),
        )
    )

    async def session_override():
        yield database_session

    app.dependency_overrides[get_session] = session_override
    async with app.router.lifespan_context(app):
        redis = app.state.redis
        await redis.ping()
        # This fixture uses the dedicated Redis DB15, never a business Redis DB.
        guard_keys = [key async for key in redis.scan_iter(match="guard:v1:*")]
        if guard_keys:
            await redis.delete(*guard_keys)
        emails = {email}
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            state = {
                "app": app,
                "client": client,
                "session": database_session,
                "redis": redis,
                "user": user,
                "email": email,
                "tag": tag,
                "emails": emails,
            }

            async def code(target=None, value="Ab123Z"):
                target = target or email
                emails.add(target)
                from starlette.requests import Request

                request = Request({"type": "http", "app": app})
                await redis.set(
                    f"auth:code:{email_key(target)}", code_digest(request, target, value), ex=300
                )
                return value

            state["code"] = code
            try:
                yield state
            finally:
                ids = (
                    await database_session.scalars(select(User.id).where(User.email.in_(emails)))
                ).all()
                keys = []
                for identity in ids:
                    keys.extend(
                        [
                            key
                            async for key in redis.scan_iter(
                                match=f"recommend:songs:v1:{identity}:*"
                            )
                        ]
                    )
                    keys.extend(
                        [
                            key
                            async for key in redis.scan_iter(
                                match=f"auth:session:ROLE_USER:{identity}:*"
                            )
                        ]
                    )
                for address in emails:
                    keys.extend(
                        f"auth:{kind}:{email_key(address)}"
                        for kind in ("code", "attempts", "cooldown")
                    )
                keys.extend([key async for key in redis.scan_iter(match="guard:v1:*")])
                if keys:
                    await redis.delete(*keys)


async def login(account, password=PASSWORD, email=None):
    response = await account["client"].post(
        "/user/login",
        json={
            "email": email or account["email"],
            "password": password,
        },
    )
    assert response.status_code == 200
    assert response.json()["code"] == 0, response.json()["message"]
    return response.json()["data"]


def bearer(token):
    return {"authorization": f"Bearer {token}"}


async def test_legacy_login_upgrade_profile_unique_tokens_and_logout(account):
    first = await login(account, email=account["email"].upper())
    second = await login(account)
    assert first != second
    assert account["user"].password.startswith("$argon2id$")
    payload = jwt.decode(first, SECRET, algorithms=["HS256"])
    assert payload["exp"] - payload["iat"] == 21600
    assert payload["claims"]["role"] == "ROLE_USER"
    profile = await account["client"].get("/user/getUserInfo", headers=bearer(first))
    assert set(profile.json()["data"]) == {
        "userId",
        "username",
        "phone",
        "email",
        "userAvatar",
        "introduction",
    }
    assert (await account["client"].post("/user/logout", headers=bearer(first))).json()["code"] == 0
    assert (
        await account["client"].get("/user/getUserInfo", headers=bearer(first))
    ).status_code == 401
    assert (
        await account["client"].get("/user/getUserInfo", headers=bearer(second))
    ).status_code == 200


async def test_register_consumes_code_stores_argon2_and_preserves_ci_uniqueness(account):
    email = f"new{account['tag']}@example.com"
    username = f"new{account['tag']}"
    code = await account["code"](email)
    body = {"email": email, "username": username, "password": PASSWORD, "verificationCode": code}
    response = await account["client"].post("/user/register", json=body)
    assert response.json()["message"] == "注册成功"
    user = await account["session"].scalar(select(User).where(User.email == email))
    assert user.password.startswith("$argon2id$") and user.status == 0
    assert (await account["client"].post("/user/register", json=body)).json()[
        "message"
    ] == "验证码无效"
    await account["code"](email)
    body["username"] = username.upper()
    assert (await account["client"].post("/user/register", json=body)).json()[
        "message"
    ] == "用户名已存在"


async def test_wrong_code_attempts_and_expiration_reject_registration(account):
    code = await account["code"]()
    body = {
        "email": account["email"],
        "username": "new_user",
        "password": PASSWORD,
        "verificationCode": "Wrong1",
    }
    for _ in range(5):
        assert (await account["client"].post("/user/register", json=body)).json()[
            "message"
        ] == "验证码无效"
    body["verificationCode"] = code
    assert (await account["client"].post("/user/register", json=body)).json()[
        "message"
    ] == "验证码无效"
    await account["code"]()
    await account["redis"].expire(f"auth:code:{email_key(account['email'])}", 0)
    assert (await account["client"].post("/user/register", json=body)).json()[
        "message"
    ] == "验证码无效"


async def test_reset_password_revokes_all_sessions_and_rejects_old_password(account):
    tokens = [await login(account), await login(account)]
    code = await account["code"]()
    response = await account["client"].patch(
        "/user/resetUserPassword",
        json={
            "email": account["email"],
            "verificationCode": code,
            "newPassword": NEW_PASSWORD,
            "repeatPassword": NEW_PASSWORD,
        },
    )
    assert response.json()["message"] == "密码重置成功"
    for token in tokens:
        assert (
            await account["client"].get("/user/getUserInfo", headers=bearer(token))
        ).status_code == 401
    assert (
        await account["client"].post(
            "/user/login",
            json={
                "email": account["email"],
                "password": PASSWORD,
            },
        )
    ).json()["message"] == "密码错误"
    await login(account, NEW_PASSWORD)


async def test_change_password_validates_old_same_repeat_and_invalidates_token(account):
    token = await login(account)
    body = {"oldPassword": "Wrong123!", "newPassword": NEW_PASSWORD, "repeatPassword": NEW_PASSWORD}
    client = account["client"]
    assert (
        await client.patch("/user/updateUserPassword", json=body, headers=bearer(token))
    ).json()["message"] == "原密码填写不正确"
    body.update(oldPassword=PASSWORD, newPassword=PASSWORD, repeatPassword=PASSWORD)
    assert (
        await client.patch("/user/updateUserPassword", json=body, headers=bearer(token))
    ).json()["message"] == "新密码不能与原密码相同"
    body.update(newPassword=NEW_PASSWORD, repeatPassword="Mismatch123!")
    assert (
        await client.patch("/user/updateUserPassword", json=body, headers=bearer(token))
    ).json()["message"] == "两次填写的新密码不一样"
    body["repeatPassword"] = NEW_PASSWORD
    assert (
        await client.patch("/user/updateUserPassword", json=body, headers=bearer(token))
    ).json()["code"] == 0
    assert (await client.get("/user/getUserInfo", headers=bearer(token))).status_code == 401


async def test_disabled_users_missing_forged_and_wrong_role_tokens(account):
    client = account["client"]
    assert (await client.get("/user/getUserInfo")).status_code == 401
    token = await login(account)
    payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    forged = jwt.encode(payload, "a-different-signing-key-at-least-32-chars", algorithm="HS256")
    assert (await client.get("/user/getUserInfo", headers=bearer(forged))).status_code == 401
    payload["claims"]["role"] = "ROLE_ADMIN"
    admin = jwt.encode(payload, SECRET, algorithm="HS256")
    assert (await client.get("/user/getUserInfo", headers=bearer(admin))).status_code == 403
    account["user"].status = 1
    await account["session"].flush()
    assert (await client.get("/user/getUserInfo", headers=bearer(token))).status_code == 403
    assert (
        await client.post("/user/login", json={"email": account["email"], "password": PASSWORD})
    ).json()["message"] == "账号被锁定"


async def test_reset_code_for_distinct_accented_mailbox_cannot_reset_legacy_ci_account(account):
    alternate = account["email"].replace("tester", "téster", 1)
    code = await account["code"](alternate)
    response = await account["client"].patch(
        "/user/resetUserPassword",
        json={
            "email": alternate,
            "verificationCode": code,
            "newPassword": NEW_PASSWORD,
            "repeatPassword": NEW_PASSWORD,
        },
    )
    assert response.json()["message"] == "邮箱不存在"
    await login(account)


async def test_password_version_rejects_surviving_session_key_and_redis_outage_fails_closed(
    account,
):
    token = await login(account)
    from app.core.security import hash_password

    account["user"].password = await hash_password(NEW_PASSWORD)
    await account["session"].flush()
    client = account["client"]
    assert (await client.get("/user/getUserInfo", headers=bearer(token))).status_code == 401
    original = account["app"].state.redis
    unavailable = Redis.from_url("redis://127.0.0.1:1/0", socket_connect_timeout=1)
    account["app"].state.redis = unavailable
    try:
        assert (await client.get("/user/getUserInfo", headers=bearer(token))).status_code == 503
    finally:
        account["app"].state.redis = original
        await unavailable.aclose()


@pytest.mark.parametrize("password", ["12345678", "abcdefgh", "abc_1234", "short1!"])
async def test_legacy_password_validation_returns_business_envelope(account, password):
    response = await account["client"].post(
        "/user/login",
        json={
            "email": account["email"],
            "password": password,
        },
    )
    assert response.status_code == 200
    assert response.json() == {"code": 1, "message": "密码格式不正确", "data": None}


async def test_real_smtp_mailpit_code_delivery_and_server_cooldown(account):
    endpoint = os.getenv("MAILPIT_URL")
    if not endpoint:
        pytest.skip("Set MAILPIT_URL to the local Docker mail sink")
    client = account["client"]
    response = await client.get("/user/sendVerificationCode", params={"email": account["email"]})
    assert response.json()["message"] == "邮件发送成功"
    assert (
        await client.get("/user/sendVerificationCode", params={"email": account["email"]})
    ).status_code == 429
    async with httpx.AsyncClient(base_url=endpoint, trust_env=False) as mail:
        messages = (await mail.get("/api/v1/messages")).json()["messages"]
        message = next(
            item
            for item in messages
            if any(recipient["Address"] == account["email"] for recipient in item["To"])
        )
        captured = (await mail.get(f"/api/v1/message/{message['ID']}")).json()
    import re

    code = re.search(r"验证码为：(\w{6})", captured["Text"]).group(1)
    stored = await account["redis"].get(f"auth:code:{email_key(account['email'])}")
    assert stored and code.encode() != stored
    # Delivered code, not the Redis digest, is accepted exactly once.
    response = await client.patch(
        "/user/resetUserPassword",
        json={
            "email": account["email"],
            "verificationCode": code,
            "newPassword": NEW_PASSWORD,
            "repeatPassword": NEW_PASSWORD,
        },
    )
    assert response.json()["code"] == 0


async def test_same_code_cannot_be_consumed_by_two_concurrent_requests(account):
    code = await account["code"]()
    request = Request({"type": "http", "app": account["app"]})
    outcomes = await asyncio.gather(
        consume_code(request, account["email"], code),
        consume_code(request, account["email"], code),
        return_exceptions=True,
    )
    assert sum(outcome is None for outcome in outcomes) == 1
    assert sum(isinstance(outcome, BusinessError) for outcome in outcomes) == 1


async def test_smtp_failure_releases_cooldown_and_does_not_create_code(account):
    original = account["app"].state.settings
    account["app"].state.settings = original.model_copy(update={"smtp_port": 1})
    try:
        response = await account["client"].get(
            "/user/sendVerificationCode", params={"email": account["email"]}
        )
    finally:
        account["app"].state.settings = original
    assert response.json()["message"] == "邮件发送失败"
    assert not await account["redis"].exists(f"auth:code:{email_key(account['email'])}")
    assert not await account["redis"].exists(f"auth:cooldown:{email_key(account['email'])}")


async def test_expired_jwt_is_rejected_even_with_live_redis_session(account):
    token = await login(account)
    payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    payload["exp"] = payload["iat"] - 1
    expired = jwt.encode(payload, SECRET, algorithm="HS256")
    response = await account["client"].get("/user/getUserInfo", headers=bearer(expired))
    assert response.status_code == 401


@pytest.mark.parametrize("operation", ["resetUserPassword", "updateUserPassword"])
async def test_password_change_preserves_session_issued_after_commit(
    account, monkeypatch, operation
):
    old_token = await login(account)
    commit = account["session"].commit
    new_tokens = []

    async def commit_with_new_login():
        await commit()
        # Reproduce a new-password login issuing its session as soon as the
        # password transaction releases its row lock, before the endpoint returns.
        request = Request({"type": "http", "app": account["app"]})
        new_tokens.append(await issue_token(request, account["user"]))

    monkeypatch.setattr(account["session"], "commit", commit_with_new_login)
    body = {"newPassword": NEW_PASSWORD, "repeatPassword": NEW_PASSWORD}
    if operation == "resetUserPassword":
        body.update(email=account["email"], verificationCode=await account["code"]())
    else:
        body["oldPassword"] = PASSWORD
    client = account["client"]
    response = await client.patch(f"/user/{operation}", json=body, headers=bearer(old_token))
    assert response.json()["code"] == 0
    assert len(new_tokens) == 1
    assert (await client.get("/user/getUserInfo", headers=bearer(new_tokens[0]))).status_code == 200
    assert (await client.get("/user/getUserInfo", headers=bearer(old_token))).status_code == 401
