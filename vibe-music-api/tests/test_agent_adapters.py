import json

import httpx
import pytest
from fastapi import HTTPException
from pydantic import SecretStr

from app.agent.adapters import ADAPTERS, create_model
from app.core.config import Settings


@pytest.mark.parametrize("provider", list(ADAPTERS))
async def test_vendor_adapters_send_chat_tools_and_provider_token_limit(provider):
    requests = []

    def respond(request):
        requests.append(request)
        payload = {
            "id": "chat-test",
            "object": "chat.completion.chunk",
            "created": 0,
            "model": "test-model",
            "choices": [{"index": 0, "delta": {"content": "你好"}, "finish_reason": None}],
        }
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            text=f"data: {json.dumps(payload)}\n\ndata: [DONE]\n\n",
        )

    settings = Settings(
        model_provider=provider,
        model_api_key=SecretStr("fake-unit-key"),
        model_name="test-model",
        model_base_url="https://model.test/v1",
        agent_max_tokens=512,
    )
    tool = {
        "type": "function",
        "function": {
            "name": "listStyles",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    }
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        model = create_model(settings, client).bind_tools([tool])
        result = await model.ainvoke("hello")
    assert result.content == "你好" and len(requests) == 1
    request = requests[0]
    body = json.loads(request.content)
    assert str(request.url) == "https://model.test/v1/chat/completions"
    assert request.headers["authorization"] == "Bearer fake-unit-key"
    assert body["model"] == "test-model" and body["stream"] is True
    assert body["tools"][0]["function"]["name"] == "listStyles"
    assert body["top_p"] == 0.7
    token_field = "max_completion_tokens" if provider == "openai" else "max_tokens"
    assert body[token_field] == 512
    assert ("enable_thinking" in body) == (provider == "siliconflow")
    if provider == "siliconflow":
        assert body["enable_thinking"] is False


async def test_missing_key_never_constructs_or_calls_vendor_model():
    async with httpx.AsyncClient() as client:
        with pytest.raises(HTTPException) as error:
            create_model(Settings(model_api_key=None), client)
    assert error.value.status_code == 503
