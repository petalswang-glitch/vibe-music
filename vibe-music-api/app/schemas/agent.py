from typing import Literal

from pydantic import ConfigDict, Field, SecretStr, field_validator

from app.schemas.song import ApiModel


class AgentChat(ApiModel):
    conversation_id: str = Field(
        default="default", min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9_-]+$"
    )
    query: str = Field(min_length=1, max_length=8000)

    @field_validator("query")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("消息内容不能为空")
        return value


class AgentConfigInput(ApiModel):
    model_config = ConfigDict(extra="forbid")
    provider: Literal["siliconflow", "deepseek", "openai", "dashscope"]
    model_name: str = Field(min_length=1, max_length=200, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$")
    api_key: SecretStr | None = Field(default=None, min_length=20, max_length=4096)

    @field_validator("api_key")
    @classmethod
    def printable_key(cls, value):
        if value is not None and any(
            not 33 <= ord(char) <= 126 for char in value.get_secret_value()
        ):
            raise ValueError("Key不能包含空白或控制字符")
        return value
