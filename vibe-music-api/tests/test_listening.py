from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import delete, select
from test_account import account as account
from test_account import bearer, login
from test_media import TrackedStream
from test_recommendation import library as library

from app.models import Favorite, ListeningHistory, Playlist, Song
from app.services import recommendation
from app.services.listening import recent_song_ids


async def test_listening_and_download_require_active_user(account, library):
    song = library[0][0]
    for method, suffix in [("POST", "listen"), ("GET", "download")]:
        response = await account["client"].request(method, f"/song/{song.id}/{suffix}")
        assert response.status_code == 401
    token = await login(account)
    account["user"].status = 1
    await account["session"].flush()
    for method, suffix in [("POST", "listen"), ("GET", "download")]:
        response = await account["client"].request(
            method, f"/song/{song.id}/{suffix}", headers=bearer(token)
        )
        assert response.status_code == 403


async def test_history_uses_authenticated_owner_deduplicates_and_cascades(account, library):
    session = account["session"]
    song = library[0][0]
    song.audio_key = "songs/listening.mp3"
    await session.flush()
    token = await login(account)
    url = f"/song/{song.id}/listen"
    for _ in range(2):
        result = await account["client"].post(url, headers=bearer(token), json={"userId": 999})
        assert result.status_code == 200 and result.json()["code"] == 0
    history = await session.get(ListeningHistory, (account["user"].id, song.id))
    assert history.play_count == 1
    history.last_played_at = datetime.now(UTC) - timedelta(minutes=31)
    await session.flush()
    assert (await account["client"].post(url, headers=bearer(token))).json()["code"] == 0
    await session.refresh(history)
    assert history.play_count == 2
    assert await recent_song_ids(session, 999) == []
    missing = await account["client"].post(
        "/song/9223372036854775807/listen", headers=bearer(token)
    )
    assert missing.json()["code"] != 0
    await session.execute(delete(Song).where(Song.id == song.id))
    await session.flush()
    assert await session.scalar(select(ListeningHistory.song_id)) is None


async def test_history_without_favorites_guides_songs_and_playlists(account, library):
    session = account["session"]
    songs, styles = library
    await session.execute(delete(Favorite).where(Favorite.user_id == account["user"].id))
    session.add(ListeningHistory(
        user_id=account["user"].id, song_id=songs[-1].id,
        play_count=1, last_played_at=datetime.now(UTC),
    ))
    session.add_all([
        Playlist(title=f"history-{i}", style=styles[1].name) for i in range(12)
    ])
    await session.flush()
    result = await recommendation.songs(session, account["user"].id, None)
    assert {row["song_id"] for row in result[:5]} == {song.id for song in songs[-5:]}
    playlists = await recommendation.playlists(session, account["user"].id)
    assert len(playlists) == 10
    assert all(row["title"].startswith("history-") for row in playlists)


async def test_download_streams_owned_database_key_and_never_forwards_token(account, library):
    song = library[0][0]
    song.audio_key = "songs/download.mp3"
    await account["session"].flush()
    token = await login(account)
    seen = []
    stream = TrackedStream(b"test-audio")

    def upstream(request):
        seen.append(request)
        return httpx.Response(200, headers={"content-type": "audio/mpeg"}, stream=stream)

    app = account["app"]
    previous = app.state.media_http
    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as remote:
        app.state.media_http = remote
        try:
            response = await account["client"].get(
                f"/song/{song.id}/download", headers=bearer(token)
            )
        finally:
            app.state.media_http = previous
    assert response.status_code == 200 and response.content == b"test-audio"
    assert response.headers["content-disposition"].startswith("attachment;")
    assert response.headers["cache-control"] == "private, no-store"
    assert "authorization" not in seen[0].headers and stream.closed
    assert "/songs/download.mp3" in str(seen[0].url)
    missing = await account["client"].get(
        f"/song/{library[0][1].id}/download", headers=bearer(token)
    )
    assert missing.status_code == 404
