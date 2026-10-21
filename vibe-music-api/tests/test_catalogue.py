from datetime import date, datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.db.session import get_session
from app.main import create_app
from app.models import Artist, Banner, Comment, Playlist, PlaylistBinding, Song, User

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def catalogue_client(database_session):
    artist = Artist(name="Café 音乐人", gender=0, area="中国内地")
    playlist = Playlist(title="Night 夜色", style="摇滚", introduction="测试歌单")
    now = datetime(2025, 4, 30, 16, 6, 31)
    user = User(
        username="曲库测试用户",
        password="not-a-real-password",
        email="catalogue@example.test",
        create_time=now,
        update_time=now,
        status=0,
    )
    database_session.add_all([artist, playlist, user])
    await database_session.flush()
    first = Song(
        artist_id=artist.id,
        name="夜曲",
        album="LøVë",
        duration="196.98",
        release_time=date(2020, 1, 2),
        lyric="[00:01]第一句",
    )
    second = Song(artist_id=artist.id, name="清晨", album="Morning", release_time=date(2021, 1, 2))
    database_session.add_all([first, second])
    await database_session.flush()
    database_session.add(PlaylistBinding(playlist_id=playlist.id, song_id=first.id))
    for index in range(2):
        database_session.add(
            Comment(
                user_id=user.id,
                playlist_id=playlist.id,
                content=f"歌单评论{index}",
                create_time=now,
                type=1,
                like_count=index,
            )
        )
    database_session.add(
        Comment(
            user_id=user.id,
            song_id=first.id,
            content="歌曲评论",
            create_time=now,
            type=0,
            like_count=3,
        )
    )
    for index in range(12):
        database_session.add(Banner(banner_url=f"/test/{index}.png", status=0 if index < 11 else 1))
    await database_session.flush()

    async def override_session():
        yield database_session

    app = create_app()
    app.dependency_overrides[get_session] = override_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, {"artist": artist.id, "playlist": playlist.id, "song": first.id}


async def test_artist_filters_and_detail_songs(catalogue_client):
    client, ids = catalogue_client
    response = await client.post(
        "/artist/getAllArtists",
        json={
            "pageNum": 1,
            "pageSize": 20,
            "artistName": "CAFE",
            "gender": 0,
            "area": "内地",
        },
    )
    assert response.status_code == 200
    assert response.json()["data"]["total"] == 1
    assert response.json()["data"]["items"][0]["artistId"] == ids["artist"]
    detail = (await client.get(f"/artist/getArtistDetail/{ids['artist']}")).json()["data"]
    assert len(detail["songs"]) == 2
    assert all(item["likeStatus"] == 0 for item in detail["songs"])


async def test_playlist_style_exact_match_and_no_comment_song_cartesian_duplicates(
    catalogue_client,
):
    client, ids = catalogue_client
    empty = await client.post(
        "/playlist/getAllPlaylists", json={"pageNum": 1, "pageSize": 20, "style": "摇"}
    )
    assert empty.json()["data"] == {"total": 0, "items": None}
    found = await client.post(
        "/playlist/getAllPlaylists", json={"pageNum": 1, "pageSize": 20, "style": "摇滚"}
    )
    assert found.json()["data"]["total"] == 1
    detail = (await client.get(f"/playlist/getPlaylistDetail/{ids['playlist']}")).json()["data"]
    assert len(detail["songs"]) == 1
    assert len(detail["comments"]) == 2
    assert detail["likeStatus"] == 0
    assert detail["comments"][0]["createTime"] == "2025-04-30"


async def test_song_detail_and_missing_ids(catalogue_client):
    client, ids = catalogue_client
    detail = (await client.get(f"/song/getSongDetail/{ids['song']}")).json()["data"]
    assert detail["lyric"] == "[00:01]第一句"
    assert detail["duration"] == "196.98"
    assert detail["comments"][0]["content"] == "歌曲评论"
    assert detail["likeStatus"] is None
    for path in ("/song/getSongDetail", "/artist/getArtistDetail", "/playlist/getPlaylistDetail"):
        response = await client.get(f"{path}/-1")
        assert response.status_code == 200
        assert response.json()["code"] == 0
        assert response.json()["data"] is None


async def test_random_recommendations_and_active_banner_limit(catalogue_client):
    client, _ = catalogue_client
    songs = (await client.get("/song/getRecommendedSongs")).json()["data"]
    assert len(songs) == 2
    assert all(item["likeStatus"] is None for item in songs)
    assert len((await client.get("/artist/getRandomArtists")).json()["data"]) == 1
    assert len((await client.get("/playlist/getRecommendedPlaylists")).json()["data"]) == 1
    banners = (await client.get("/banner/getBannerList")).json()["data"]
    assert len(banners) == 9
    assert [item["bannerUrl"] for item in banners] == [
        f"/test/{index}.png" for index in range(10, 1, -1)
    ]
