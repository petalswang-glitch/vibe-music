from datetime import date
from typing import Annotated

from pydantic import BeforeValidator, Field

from app.schemas.admin import LegacyId
from app.schemas.song import ApiModel

OptionalId = Annotated[
    LegacyId | None, BeforeValidator(lambda value: None if value == "" else value)
]


class SongSearch(ApiModel):
    page_num: int = Field(ge=1, le=2**31 - 1)
    page_size: int = Field(ge=1, le=2**31 - 1)
    artist_id: OptionalId = None
    song_name: str | None = None
    album: str | None = None


class SongAdd(ApiModel):
    artist_id: OptionalId = None
    song_name: str = Field(min_length=1, max_length=255)
    album: str = Field(min_length=1, max_length=255)
    style: str | None = Field(default=None, max_length=255)
    release_time: date


class SongUpdate(ApiModel):
    song_id: LegacyId
    artist_id: OptionalId = None
    song_name: str | None = Field(default=None, min_length=1, max_length=255)
    album: str | None = Field(default=None, min_length=1, max_length=255)
    style: str | None = Field(default=None, max_length=255)
    release_time: date | None = None


class ManagedSong(ApiModel):
    song_id: int
    artist_name: str | None
    song_name: str
    album: str
    lyric: str | None
    duration: str | None
    style: str | None
    cover_url: str | None
    audio_url: str | None
    release_time: date
