from pydantic import Field

from app.schemas.admin import LegacyId
from app.schemas.catalogue import PlaylistQuery, PlaylistView
from app.schemas.song import ApiModel


class PlaylistSearch(PlaylistQuery):
    page_num: int = Field(ge=1, le=2**31 - 1)


class PlaylistAdd(ApiModel):
    title: str = Field(min_length=1, max_length=255)
    introduction: str | None = None
    style: str | None = Field(default=None, max_length=255)


class PlaylistUpdate(ApiModel):
    playlist_id: LegacyId
    title: str | None = Field(default=None, min_length=1, max_length=255)
    introduction: str | None = None
    style: str | None = Field(default=None, max_length=255)


class ManagedPlaylist(PlaylistView):
    introduction: str | None
    style: str | None
