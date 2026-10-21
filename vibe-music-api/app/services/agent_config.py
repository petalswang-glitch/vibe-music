import json
from datetime import datetime

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from pydantic import SecretStr
from sqlalchemy import select

from app.models import UserAgentConfig


def cipher(settings):
    value = settings.agent_key_encryption_key
    if not value:
        raise HTTPException(503, "服务端尚未配置Agent密钥加密，请联系管理员")
    try:
        return Fernet(value.get_secret_value().encode())
    except (ValueError, TypeError):
        raise HTTPException(503, "Agent密钥加密配置不可用，请联系管理员") from None


def decrypt(settings, row):
    try:
        value = json.loads(cipher(settings).decrypt(row.encrypted_key.encode()))
        if value["userId"] != row.user_id or value["provider"] != row.provider:
            raise ValueError("credential owner mismatch")
        key = value["apiKey"]
        if not isinstance(key, str) or not key:
            raise ValueError("invalid key")
        return SecretStr(key)
    except (InvalidToken, ValueError, TypeError, KeyError):
        raise HTTPException(503, "已保存的Agent Key无法读取，请重新配置或联系管理员") from None


def view(row):
    return {
        "configured": row is not None,
        "provider": row.provider if row else "siliconflow",
        "modelName": row.model_name if row else "deepseek-ai/DeepSeek-V4.1-Flash",
    }


async def save(session, settings, user, body):
    # Caller holds the user lock, preventing simultaneous first configuration/upsert.
    row = await session.scalar(
        select(UserAgentConfig).where(UserAgentConfig.user_id == user.id).with_for_update()
    )
    if body.api_key is None:
        if row is None or row.provider != body.provider:
            raise HTTPException(422, "首次配置或更换厂商时必须填写新的API Key")
        # Confirm it is readable before preserving it; never carry a key to a new vendor.
        decrypt(settings, row)
        encrypted = row.encrypted_key
    else:
        encrypted = (
            cipher(settings)
            .encrypt(
                json.dumps(
                    {
                        "userId": user.id,
                        "provider": body.provider,
                        "apiKey": body.api_key.get_secret_value(),
                    }
                ).encode()
            )
            .decode()
        )
    if row is None:
        row = UserAgentConfig(user_id=user.id)
        session.add(row)
    row.provider = body.provider
    row.model_name = body.model_name
    row.encrypted_key = encrypted
    row.update_time = datetime.now()
    await session.commit()
    return view(row)


async def user_model_settings(session, settings, user_id):
    row = await session.get(UserAgentConfig, user_id)
    if row is None:
        raise HTTPException(409, "请先在个人中心配置自己的模型API Key")
    return settings.model_copy(
        update={
            "model_provider": row.provider,
            "model_name": row.model_name,
            "model_api_key": decrypt(settings, row),
            # End-user credentials go only to our fixed, reviewed provider endpoints.
            "model_base_url": None,
        }
    )
