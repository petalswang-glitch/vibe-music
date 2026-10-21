import pytest
import pytest_asyncio
from sqlalchemy import select
from starlette.requests import Request
from test_account import account as account
from test_account import bearer
from test_favorite import other_identity

from app.models import UserAgentConfig
from app.services.agent_config import decrypt, user_model_settings
from app.services.auth import issue_token

TEST_KEY = "sk-isolated-personal-provider-key-only"


@pytest_asyncio.fixture
async def personal_agent(account):
    token = await issue_token(Request({"type": "http", "app": account["app"]}), account["user"])
    headers = bearer(token)
    response = await account["client"].put(
        "/user/agent-config",
        headers=headers,
        json={"provider": "siliconflow", "modelName": "test-model", "apiKey": TEST_KEY},
    )
    assert response.status_code == 200 and response.json()["code"] == 0
    account["client"].headers.update(headers)
    try:
        yield token
    finally:
        account["client"].headers.pop("authorization", None)


async def test_personal_key_is_encrypted_never_returned_and_provider_change_requires_new_key(
    account,
):
    client = account["client"]
    assert (await client.get("/user/agent-config")).status_code == 401
    token = await issue_token(Request({"type": "http", "app": account["app"]}), account["user"])
    headers = bearer(token)
    body = {"provider": "siliconflow", "modelName": "first-model", "apiKey": TEST_KEY}
    response = await client.put("/user/agent-config", headers=headers, json=body)
    assert response.status_code == 200 and TEST_KEY not in response.text
    row = await account["session"].get(UserAgentConfig, account["user"].id)
    assert TEST_KEY not in row.encrypted_key and row.encrypted_key.startswith("gAAAA")
    assert decrypt(account["app"].state.settings, row).get_secret_value() == TEST_KEY
    read = await client.get("/user/agent-config", headers=headers)
    assert read.headers["cache-control"] == "private, no-store"
    assert read.json()["data"] == {
        "configured": True,
        "provider": "siliconflow",
        "modelName": "first-model",
    }
    assert (
        await client.put(
            "/user/agent-config",
            headers=headers,
            json={"provider": "openai", "modelName": "another-model"},
        )
    ).status_code == 422
    assert row.provider == "siliconflow"
    keep = await client.put(
        "/user/agent-config",
        headers=headers,
        json={"provider": "siliconflow", "modelName": "changed-model"},
    )
    assert keep.status_code == 200 and row.model_name == "changed-model"
    assert decrypt(account["app"].state.settings, row).get_secret_value() == TEST_KEY


async def test_credentials_are_owned_by_current_user_and_cannot_override_endpoints(
    account, personal_agent
):
    other, token = await other_identity(account)
    response = await account["client"].get("/user/agent-config", headers=bearer(token))
    assert response.json()["data"]["configured"] is False
    body = {
        "provider": "openai",
        "modelName": "own-model",
        "apiKey": "sk-another-personal-provider-key",
    }
    assert (
        await account["client"].put(
            "/user/agent-config",
            headers=bearer(token),
            json={**body, "baseUrl": "http://169.254.169.254", "userId": account["user"].id},
        )
    ).json()["code"] == 1
    assert (
        await account["client"].put("/user/agent-config", headers=bearer(token), json=body)
    ).json()["code"] == 0
    first = await user_model_settings(
        account["session"], account["app"].state.settings, account["user"].id
    )
    second = await user_model_settings(account["session"], account["app"].state.settings, other.id)
    assert first.model_api_key.get_secret_value() == TEST_KEY
    assert second.model_api_key.get_secret_value() == body["apiKey"]
    assert first.model_base_url is None and second.model_base_url is None
    assert (await account["client"].delete("/user/agent-config", headers=bearer(token))).json()[
        "code"
    ] == 0
    assert (await account["client"].get("/user/agent-config")).json()["data"]["configured"] is True


async def test_bad_ciphertext_or_missing_encryption_never_falls_back_to_shared_key(
    account, personal_agent
):
    from fastapi import HTTPException

    row = await account["session"].get(UserAgentConfig, account["user"].id)
    row.encrypted_key = "invalid ciphertext"
    await account["session"].flush()
    with pytest.raises(HTTPException) as error:
        await user_model_settings(
            account["session"], account["app"].state.settings, account["user"].id
        )
    assert error.value.status_code == 503 and TEST_KEY not in str(error.value.detail)
    assert (await account["client"].post("/agent/chat", json={"query": "test"})).status_code == 503


async def test_deleting_account_cascades_its_encrypted_key(account, personal_agent):
    identity = account["user"].id
    response = await account["client"].delete("/user/deleteAccount")
    assert response.json()["code"] == 0
    assert (
        await account["session"].scalar(
            select(UserAgentConfig.user_id).where(UserAgentConfig.user_id == identity)
        )
        is None
    )


async def test_each_stream_uses_its_users_key_and_never_falls_back(
    account, personal_agent, monkeypatch
):
    import hashlib

    from langchain_core.messages import AIMessage
    from pydantic import SecretStr
    from test_agent_runtime import ScriptedModel

    second_user, second_token = await other_identity(account)
    second_key = "sk-only-second-user-provider-key"
    await account["client"].put(
        "/user/agent-config",
        headers=bearer(second_token),
        json={
            "provider": "deepseek",
            "modelName": "second-model",
            "apiKey": second_key,
        },
    )
    account["app"].state.settings = account["app"].state.settings.model_copy(
        update={"model_api_key": SecretStr("sk-owner-key-must-never-be-used")}
    )
    calls = []

    def create(settings, client):
        calls.append((settings.model_provider, settings.model_api_key.get_secret_value()))
        return ScriptedModel(responses=[AIMessage(content=f"reply-{len(calls)}")])

    monkeypatch.setattr("app.agent.runtime.create_model", create)
    body = {"conversationId": "same-id", "query": "hello"}
    first = await account["client"].post("/agent/chat", json=body)
    second = await account["client"].post("/agent/chat", json=body, headers=bearer(second_token))
    assert "reply-1" in first.text and "reply-2" in second.text
    assert calls == [("siliconflow", TEST_KEY), ("deepseek", second_key)]
    assert all(key not in first.text + second.text for key in (TEST_KEY, second_key))
    await account["client"].delete("/user/agent-config", headers=bearer(second_token))
    missing = await account["client"].post("/agent/chat", json=body, headers=bearer(second_token))
    assert missing.status_code == 409 and len(calls) == 2
    for identity in (account["user"].id, second_user.id):
        digest = hashlib.sha256(f"user:{identity}:same-id".encode()).hexdigest()
        await account["redis"].delete(f"agent:history:{digest}", f"agent:lock:{digest}")


async def test_wrong_master_key_and_transplanted_ciphertexts_are_rejected(account, personal_agent):
    from cryptography.fernet import Fernet
    from fastapi import HTTPException
    from pydantic import SecretStr

    settings = account["app"].state.settings
    first = await account["session"].get(UserAgentConfig, account["user"].id)
    bad_settings = settings.model_copy(update={"agent_key_encryption_key": None})
    with pytest.raises(HTTPException) as error:
        decrypt(bad_settings, first)
    assert error.value.status_code == 503
    bad_settings = settings.model_copy(
        update={"agent_key_encryption_key": SecretStr(Fernet.generate_key().decode())}
    )
    with pytest.raises(HTTPException) as error:
        decrypt(bad_settings, first)
    assert error.value.status_code == 503
    other, _ = await other_identity(account)
    transplant = UserAgentConfig(
        user_id=other.id,
        provider=first.provider,
        model_name=first.model_name,
        encrypted_key=first.encrypted_key,
    )
    with pytest.raises(HTTPException) as error:
        decrypt(settings, transplant)
    assert error.value.status_code == 503
    first.provider = "openai"
    with pytest.raises(HTTPException) as error:
        decrypt(settings, first)
    assert error.value.status_code == 503
