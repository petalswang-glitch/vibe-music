from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    database_url: str = "postgresql+asyncpg://vibe:vibe_local_dev@127.0.0.1:25432/vibe_music"
    redis_url: str = "redis://127.0.0.1:26379/0"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    minio_endpoint: str = "127.0.0.1:29000"
    minio_access_key: str = "vibe_local_media"
    minio_secret_key: str = "vibe_local_media_dev_only"
    minio_secure: bool = False
    minio_bucket: str = "vibe-music-data"
    minio_region: str = "us-east-1"
    auth_secret: SecretStr | None = None
    auth_token_seconds: int = Field(default=21600, gt=0)
    smtp_host: str = "127.0.0.1"
    smtp_port: int = 21025
    smtp_from: str = "Vibe Music <noreply@vibe.example>"
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_start_tls: bool = False
    smtp_use_tls: bool = False
    model_provider: Literal["siliconflow", "deepseek", "openai", "dashscope"] = "siliconflow"
    model_api_key: SecretStr | None = None
    model_name: str = "deepseek-ai/DeepSeek-V4.1-Flash"
    model_base_url: str | None = None
    agent_timeout_seconds: float = Field(default=120, gt=0, le=300)
    agent_max_tokens: int = Field(default=2048, ge=64, le=16384)
    agent_history_seconds: int = Field(default=604800, ge=60)
    agent_owner_concurrency: int = Field(default=2, ge=1, le=10)
    agent_global_concurrency: int = Field(default=8, ge=1, le=100)
    agent_key_encryption_key: SecretStr | None = None

    @field_validator("smtp_username", "smtp_password", mode="before")
    @classmethod
    def empty_smtp_credentials(cls, value):
        return None if value == "" else value

    @model_validator(mode="after")
    def validate_auth_secret(self):
        if self.auth_secret is not None and len(self.auth_secret.get_secret_value()) < 32:
            raise ValueError("AUTH_SECRET must contain at least 32 characters")
        if self.app_env != "development" and self.auth_secret is None:
            raise ValueError("AUTH_SECRET is required outside development")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
