from datetime import date

from test_account import account as account
from test_account import bearer
from test_admin import admin as admin
from test_admin import login

from app.models import Artist, Playlist, Song


async def test_dashboard_counts_use_source_style_contains_area_exact_and_known_genders(
    account, admin
):
    session, client = account["session"], account["client"]
    artists = [
        Artist(name="One", area="美国", gender=0),
        Artist(name="Two", area="中国", gender=1),
        Artist(name="Three", area="中国台湾", gender=2),
    ]
    session.add_all(artists)
    await session.flush()
    session.add_all(
        [
            Song(
                artist_id=artists[0].id,
                name="A",
                album="A",
                style="摇滚,古典",
                release_time=date(2026, 1, 1),
            ),
            Song(
                artist_id=artists[1].id,
                name="B",
                album="B",
                style="摇滚",
                release_time=date(2026, 1, 2),
            ),
            Song(
                artist_id=artists[2].id,
                name="C",
                album="C",
                style=None,
                release_time=date(2026, 1, 3),
            ),
            Playlist(title="Playlist", style="摇滚"),
        ]
    )
    await session.commit()
    headers = bearer(await login(account, admin))
    cases = [
        ("/admin/getAllUsersCount", {}, 1),
        ("/admin/getAllArtistsCount", {}, 3),
        ("/admin/getAllSongsCount", {}, 3),
        ("/admin/getAllPlaylistsCount", {}, 1),
        ("/admin/getAllSongsCount", {"style": "摇滚"}, 2),
        ("/admin/getAllSongsCount", {"style": "古典"}, 1),
        ("/admin/getAllSongsCount", {"style": "轻音乐"}, 0),
        ("/admin/getAllArtistsCount", {"area": "中国"}, 1),
        ("/admin/getAllArtistsCount", {"area": "美国"}, 1),
        ("/admin/getAllArtistsCount", {"gender": 0}, 1),
        ("/admin/getAllArtistsCount", {"gender": 1}, 1),
    ]
    for path, params, expected in cases:
        response = await client.get(path, params=params, headers=headers)
        assert response.headers["cache-control"] == "private, no-store"
        assert response.json()["data"] == expected


async def test_empty_catalogue_counts_are_actual_zero(account, admin):
    headers = bearer(await login(account, admin))
    for path in (
        "/admin/getAllArtistsCount",
        "/admin/getAllSongsCount",
        "/admin/getAllPlaylistsCount",
    ):
        response = await account["client"].get(path, headers=headers)
        assert response.json()["data"] == 0
