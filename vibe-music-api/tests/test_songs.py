import pytest

pytestmark = pytest.mark.integration


async def test_legacy_camel_case_contract_and_pagination(song_client):
    response = await song_client.post("/song/getAllSongs", json={"pageNum": 1, "pageSize": 1})
    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 0
    assert payload["message"] == "操作成功"
    assert payload["data"]["total"] == 2
    item = payload["data"]["items"][0]
    assert set(item) == {
        "songId",
        "songName",
        "artistName",
        "album",
        "duration",
        "coverUrl",
        "audioUrl",
        "likeStatus",
        "releaseTime",
    }
    assert item["songName"] == "Morning"
    assert item["releaseTime"] == "2020-01-02"
    assert item["likeStatus"] == 0
    assert item["audioUrl"] is None
    page_two = await song_client.post("/song/getAllSongs", json={"pageNum": 2, "pageSize": 1})
    assert page_two.json()["data"]["items"][0]["songName"] == "夜曲"


@pytest.mark.parametrize(
    "filters",
    [
        {"songName": "MOR"},
        {"artistName": "ALICE", "album": "sun"},
        {"album": "love"},
        {"album": "Ve"},
        {"songName": "Morning", "artistName": "", "album": None},
    ],
)
async def test_filters_use_json_body_and_case_insensitive_matching(song_client, filters):
    response = await song_client.post(
        "/song/getAllSongs", json={"pageNum": 1, "pageSize": 20, **filters}
    )
    assert response.json()["data"]["total"] == 1
    assert response.json()["data"]["items"][0]["songName"] == "Morning"


@pytest.mark.parametrize(
    "query",
    [
        {"pageNum": 1, "pageSize": 20, "songName": "不存在"},
        {"pageNum": 99, "pageSize": 20},
    ],
)
async def test_no_results_matches_legacy_null_items(song_client, query):
    response = await song_client.post("/song/getAllSongs", json=query)
    assert response.json() == {
        "code": 0,
        "message": "未找到相关数据",
        "data": {"total": 0, "items": None},
    }


async def test_pagination_must_be_in_body_not_query_string(song_client):
    response = await song_client.post("/song/getAllSongs?pageNum=1&pageSize=20")
    assert response.status_code == 422
