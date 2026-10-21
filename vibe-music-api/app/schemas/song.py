from datetime import date
from typing import TypeVar

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Result[T](ApiModel):
    code: int = 0
    message: str = "操作成功"
    data: T


class PageResult[T](ApiModel):
    total: int
    items: list[T] | None


class SongQuery(ApiModel):
    page_num: int = Field(ge=1)
    page_size: int = Field(ge=1)
    song_name: str | None = None
    artist_name: str | None = None
    album: str | None = None


class SongView(ApiModel):
    song_id: int
    song_name: str
    artist_name: str | None
    album: str
    duration: str | None
    cover_url: str | None
    audio_url: str | None
    like_status: int = 0
    release_time: date
