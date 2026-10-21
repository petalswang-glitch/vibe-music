from pydantic import Field

from app.schemas.song import ApiModel


class SongComment(ApiModel):
    song_id: int
    content: str = Field(max_length=255)


class PlaylistComment(ApiModel):
    playlist_id: int
    content: str = Field(max_length=255)
