from datetime import date

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.main import create_app
from app.repositories.catalogue import artist_selection, playlist_selection
from app.schemas.catalogue import ArtistQuery, PlaylistQuery, SongDetailView
from app.services.catalogue import page_result


def test_catalogue_routes_keep_legacy_method_paths_and_request_body():
    schema = create_app().openapi()
    expected = {
        "/artist/getAllArtists": "post",
        "/artist/getRandomArtists": "get",
        "/artist/getArtistDetail/{id}": "get",
        "/playlist/getAllPlaylists": "post",
        "/playlist/getRecommendedPlaylists": "get",
        "/playlist/getPlaylistDetail/{id}": "get",
        "/song/getRecommendedSongs": "get",
        "/song/getSongDetail/{id}": "get",
        "/banner/getBannerList": "get",
    }
    for path, method in expected.items():
        assert method in schema["paths"][path]
    assert (
        "application/json"
        in schema["paths"]["/artist/getAllArtists"]["post"]["requestBody"]["content"]
    )
    fields = schema["components"]["schemas"]["ArtistQuery"]["properties"]
    assert set(fields) == {"pageNum", "pageSize", "artistName", "gender", "area"}
    assert set(schema["components"]["schemas"]["PlaylistQuery"]["properties"]) == {
        "pageNum",
        "pageSize",
        "title",
        "style",
    }


def test_playlist_style_is_exact_comparison_not_wildcard_search():
    statement = playlist_selection(PlaylistQuery(pageNum=1, pageSize=20, title="夜", style="摇"))
    compiled = statement.compile(dialect=postgresql.dialect())
    assert str(compiled).count("ILIKE") == 1  # title only; style uses equality
    assert "摇" in compiled.params.values()
    assert "%夜%" in compiled.params.values()


def test_artist_gender_zero_is_not_treated_as_unset_and_search_is_bound():
    query = ArtistQuery(pageNum=1, pageSize=20, artistName="x' OR 1=1 --", gender=0, area="内地")
    compiled = artist_selection(query).compile(dialect=postgresql.dialect())
    assert "tb_artist.gender =" in str(compiled)
    assert 0 in compiled.params.values()
    assert "OR 1=1" not in str(compiled)
    assert "%x' OR 1=1 --%" in compiled.params.values()


def test_playlist_page_size_preserves_legacy_maximum():
    with pytest.raises(ValidationError):
        PlaylistQuery(pageNum=1, pageSize=101)


def test_empty_page_preserves_legacy_null_items_and_message():
    result = page_result(500, [], dict).model_dump(by_alias=True)
    assert result == {"code": 0, "message": "未找到相关数据", "data": {"total": 0, "items": None}}


def test_song_detail_preserves_lyric_nullable_like_status_and_date_only_comments():
    view = SongDetailView(
        song_id=1,
        song_name="夜曲",
        artist_name="音乐人",
        album="专辑",
        duration="196.98",
        cover_url=None,
        audio_url=None,
        release_time=date(2020, 1, 2),
        lyric="[00:01]歌词",
        comments=[
            {
                "comment_id": 3,
                "username": "用户",
                "user_avatar": None,
                "content": "好听",
                "create_time": date(2025, 4, 30),
                "like_count": 2,
            }
        ],
    ).model_dump(mode="json", by_alias=True)
    assert view["likeStatus"] is None
    assert view["lyric"] == "[00:01]歌词"
    assert view["duration"] == "196.98"
    assert view["comments"][0]["createTime"] == "2025-04-30"
    assert "create_time" not in view["comments"][0]
