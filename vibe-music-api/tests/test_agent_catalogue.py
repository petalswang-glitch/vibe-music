from datetime import date

import pytest
import pytest_asyncio

from app.models import Artist, Song, Style
from app.services import agent_catalogue as tools


@pytest_asyncio.fixture
async def agent_songs(database_session):
    artists = [Artist(name="Agent Café Artist"), Artist(name="中文歌手")]
    database_session.add_all(artists)
    await database_session.flush()
    songs = [
        Song(
            artist_id=artists[i % 2].id,
            name="Target Song" if i == 0 else f"Agent Song {i}",
            album="Needle Album" if i == 3 else "Album",
            duration="123.45",
            cover_url="/media/agent-test-cover.png",
            audio_url="/media/agent-test.mp3",
            style="摇滚,古典" if i == 0 else "摇滚" if i < 15 else None,
            release_time=date(2026, 1, i + 1),
        )
        for i in range(25)
    ]
    database_session.add_all(songs)
    await database_session.flush()
    return {"songs": songs, "artists": artists}


@pytest.mark.parametrize("keyword,index", [("target", 0), ("Needle", 3)])
async def test_agent_keyword_matches_song_or_album_with_original_vo(
    database_session, agent_songs, keyword, index
):
    rows = await tools.search_songs(database_session, keyword)
    assert len(rows) == 1
    expected = agent_songs["songs"][index]
    assert rows[0] == {
        "songId": expected.id,
        "songName": expected.name,
        "artistName": agent_songs["artists"][index % 2].name,
        "album": expected.album,
        "duration": "123.45",
        "coverUrl": "/media/agent-test-cover.png",
        "audioUrl": "/media/agent-test.mp3",
        "likeStatus": None,
        "releaseTime": expected.release_time.isoformat(),
    }


@pytest.mark.parametrize("keyword,index", [("AGENT CAFE", 0), ("中文歌手", 1)])
async def test_agent_artist_search_limit_order_and_accent_case(
    database_session, agent_songs, keyword, index
):
    rows = await tools.search_songs(database_session, keyword)
    expected = [s for i, s in enumerate(agent_songs["songs"]) if i % 2 == index][::-1][:10]
    assert [r["songId"] for r in rows] == [s.id for s in expected]
    assert len(rows) == 10


@pytest.mark.parametrize("keyword", [None, "", "not in catalogue", "' OR 1=1 --"])
async def test_agent_empty_and_absent_keyword_does_not_fabricate_rows(
    database_session, agent_songs, keyword
):
    assert await tools.search_songs(database_session, keyword) == []


async def test_agent_style_uses_song_string_without_genre_and_caps_ten(
    database_session, agent_songs
):
    rows = await tools.recommend_songs_by_style(database_session, "摇滚")
    assert [r["songId"] for r in rows] == [s.id for s in agent_songs["songs"][:10]]
    assert {r["artistName"] for r in rows} == {a.name for a in agent_songs["artists"]}
    classic = await tools.recommend_songs_by_style(database_session, "古典")
    assert [r["songId"] for r in classic] == [agent_songs["songs"][0].id]
    assert await tools.recommend_songs_by_style(database_session, "未收录风格") == []
    assert await tools.recommend_songs_by_style(database_session, None) == []


async def test_agent_hot_songs_are_twenty_unique_real_rows(database_session, agent_songs):
    rows = await tools.get_hot_songs(database_session)
    ids = {r["songId"] for r in rows}
    assert len(rows) == len(ids) == 20
    assert ids <= {s.id for s in agent_songs["songs"]}
    assert all(r["likeStatus"] is None for r in rows)


async def test_agent_style_dictionary_and_empty_catalogue(database_session):
    assert await tools.list_styles(database_session) == []
    assert await tools.get_hot_songs(database_session) == []
    assert await tools.search_songs(database_session, "anything") == []
    database_session.add_all([Style(name="摇滚"), Style(name="轻音乐"), Style(name="Café")])
    await database_session.flush()
    assert await tools.list_styles(database_session) == ["摇滚", "轻音乐", "Café"]
