"""Model vendor boundary. Graphs and tools depend only on the chat model interface."""

from dataclasses import dataclass
from typing import Protocol

import httpx
from fastapi import HTTPException
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI

from app.core.config import Settings


class ModelAdapter(Protocol):
    def create(self, settings: Settings, client: httpx.AsyncClient) -> BaseChatModel: ...


@dataclass(frozen=True)
class OpenAICompatibleAdapter:
    base_url: str
    vendor: str

    def create(self, settings: Settings, client: httpx.AsyncClient) -> BaseChatModel:
        if not settings.model_api_key or not settings.model_api_key.get_secret_value().strip():
            raise HTTPException(503, "尚未配置模型密钥，请联系管理员")
        options = {
            "model": settings.model_name,
            "api_key": settings.model_api_key,
            "base_url": settings.model_base_url or self.base_url,
            "http_async_client": client,
            "http_socket_options": (),
            "timeout": settings.agent_timeout_seconds,
            "max_retries": 1,
            "streaming": True,
            "stream_usage": False,
            "use_responses_api": False,
            "temperature": None,
            "top_p": 0.7,
        }
        if self.vendor == "openai":
            options["max_tokens"] = settings.agent_max_tokens
        else:
            # Keep compatible APIs' max_tokens, without ChatOpenAI's OpenAI-specific rename.
            options["extra_body"] = {"max_tokens": settings.agent_max_tokens}
            if self.vendor == "siliconflow":
                options["extra_body"]["enable_thinking"] = False
        return ChatOpenAI(**options)


ADAPTERS: dict[str, ModelAdapter] = {
    "siliconflow": OpenAICompatibleAdapter("https://api.siliconflow.cn/v1", "siliconflow"),
    "deepseek": OpenAICompatibleAdapter("https://api.deepseek.com/v1", "deepseek"),
    "openai": OpenAICompatibleAdapter("https://api.openai.com/v1", "openai"),
    "dashscope": OpenAICompatibleAdapter(
        "https://dashscope.aliyuncs.com/compatible-mode/v1", "dashscope"
    ),
}


def create_model(settings: Settings, client: httpx.AsyncClient) -> BaseChatModel:
    return ADAPTERS[settings.model_provider].create(settings, client)
