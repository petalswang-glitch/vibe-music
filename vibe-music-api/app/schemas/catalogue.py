from datetime import date

from pydantic import Field

from app.schemas.song import ApiModel, SongView


class ArtistQuery(ApiModel):
    page_num: int = Field(ge=1)
    page_size: int = Field(ge=1)
    artist_name: str | None = None
    gender: int | None = None
    area: str | None = None


class PlaylistQuery(ApiModel):
    page_num: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    title: str | None = None
    style: str | None = None


class ArtistView(ApiModel):
    artist_id: int
    artist_name: str
    avatar: str | None


class ArtistDetailView(ArtistView):
    gender: int | None
    birth: date | None
    area: str | None
    introduction: str | None
    songs: list[SongView]


class CommentView(ApiModel):
    comment_id: int
    username: str | None
    user_avatar: str | None
    content: str
    create_time: date
    like_count: int | None


class SongDetailView(SongView):
    lyric: str | None
    # Legacy detail/random queries leave this nullable for anonymous visitors.
    like_status: int | None = None
    comments: list[CommentView]


class RecommendedSongView(SongView):
    like_status: int | None = None


class PlaylistView(ApiModel):
    playlist_id: int
    title: str
    cover_url: str | None


class PlaylistDetailView(PlaylistView):
    introduction: str | None
    songs: list[SongView]
    like_status: int = 0
    comments: list[CommentView]


class BannerView(ApiModel):
    banner_id: int
    banner_url: str
