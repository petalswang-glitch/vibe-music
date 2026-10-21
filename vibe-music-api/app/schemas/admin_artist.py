from datetime import date
from typing import Annotated

from pydantic import BeforeValidator, Field

from app.schemas.admin import LegacyId
from app.schemas.catalogue import ArtistQuery, ArtistView
from app.schemas.song import ApiModel

JavaInteger = Annotated[int, Field(ge=-(2**31), le=2**31 - 1)]
OptionalDate = Annotated[date | None, BeforeValidator(lambda value: None if value == "" else value)]


class ArtistSearch(ArtistQuery):
    page_num: int = Field(ge=1, le=2**31 - 1)
    page_size: int = Field(ge=1, le=2**31 - 1)
    gender: JavaInteger | None = None


class ArtistFields(ApiModel):
    artist_name: str = Field(min_length=1, max_length=100)
    gender: JavaInteger | None = None
    birth: OptionalDate = None
    area: str | None = Field(default=None, max_length=30)
    introduction: str | None = Field(default=None, max_length=255)


class ArtistUpdate(ArtistFields):
    artist_id: LegacyId
    artist_name: str | None = Field(default=None, min_length=1, max_length=100)


class ManagedArtist(ArtistView):
    gender: int | None
    birth: date | None
    area: str | None
    introduction: str | None


class ArtistName(ApiModel):
    artist_id: int
    artist_name: str
