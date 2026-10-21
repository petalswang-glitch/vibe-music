import anyio
import httpx
import pytest
from minio import Minio
from starlette.requests import ClientDisconnect

from app.api.routes.media import MediaStreamingResponse
from app.main import create_app


class TrackedStream(httpx.AsyncByteStream):
    def __init__(self, data=b"audio"):
        self.data = data
        self.closed = False

    async def __aiter__(self):
        yield self.data

    async def aclose(self):
        await anyio.sleep(0)
        self.closed = True


@pytest.mark.parametrize(
    ("method", "status", "body", "headers"),
    [
        ("GET", 200, b"audio", {"content-type": "audio/mpeg", "content-length": "5"}),
        ("GET", 206, b"ud", {"content-range": "bytes 1-2/5", "content-length": "2"}),
        ("HEAD", 200, b"", {"content-type": "audio/mpeg", "content-length": "5"}),
        ("GET", 304, b"", {"etag": '"media-v1"'}),
        ("GET", 416, b"", {"content-range": "bytes */5"}),
    ],
)
async def test_media_forwards_range_and_cache_status_closes_stream(method, status, body, headers):
    stream = TrackedStream(body)
    seen = []

    async def upstream(request):
        seen.append(request)
        if status == 416 and request.method == "HEAD":
            return httpx.Response(
                200,
                headers={"content-length": "5", "etag": '"media-v1"'},
                stream=TrackedStream(b""),
            )
        return httpx.Response(status, headers={"etag": '"media-v1"', **headers}, stream=stream)

    app = create_app()
    app.state.media_store = Minio(
        "minio:9000", "test-access", "test-secret", secure=False, region="us-east-1"
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as remote:
        app.state.media_http = remote
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            result = await client.request(
                method,
                "/media/songs/a%20b.mp3",
                headers={
                    "range": "bytes=1-2",
                    "if-range": '"media-v1"',
                    "authorization": "Bearer private-user",
                    "cookie": "private-cookie",
                },
            )
    assert result.status_code == status
    assert result.content == body
    for name, value in headers.items():
        assert result.headers[name] == value
    assert seen[0].url.host == "minio"
    assert seen[0].url.path == "/vibe-music-data/songs/a b.mp3"
    assert seen[0].method == method
    assert seen[0].headers["range"] == "bytes=1-2"
    assert seen[0].headers["if-range"] == '"media-v1"'
    assert "authorization" not in seen[0].headers
    assert "cookie" not in seen[0].headers
    assert "X-Amz-Signature" in seen[0].url.params
    assert "X-Amz-Signature" not in result.text
    assert stream.closed


@pytest.mark.parametrize("status, expected", [(404, 404), (403, 502), (500, 502), (302, 502)])
async def test_media_errors_do_not_leak_internal_xml_or_redirect(status, expected):
    stream = TrackedStream(b"internal error and credentials")

    async def upstream(request):
        return httpx.Response(status, stream=stream, headers={"location": "http://internal"})

    app = create_app()
    app.state.media_store = Minio("minio:9000", "key", "secret", secure=False, region="us-east-1")
    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as remote:
        app.state.media_http = remote
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/media/songs/missing.mp3")
    assert response.status_code == expected
    assert response.json()["code"] == 1
    assert "internal" not in response.text
    assert "location" not in response.headers
    assert stream.closed


async def test_media_network_failure_returns_clear_error():
    async def upstream(request):
        raise httpx.ConnectError("internal endpoint", request=request)

    app = create_app()
    app.state.media_store = Minio("minio:9000", "key", "secret", secure=False, region="us-east-1")
    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as remote:
        app.state.media_http = remote
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/media/song.mp3")
    assert response.status_code == 502
    assert response.json()["message"] == "媒体服务暂时不可用"


@pytest.mark.parametrize(
    "path", ["/media/%2e%2e/song", "/media/a//b", "/media/a%5Cb", "/media/a%00b"]
)
async def test_invalid_keys_are_rejected_before_accessing_storage(path):
    app = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(path)
    assert response.status_code == 400


@pytest.mark.parametrize("failure_event", ["http.response.start", "http.response.body"])
async def test_disconnected_send_closes_upstream_immediately(failure_event):
    stream = TrackedStream()
    upstream = httpx.Response(200, stream=stream)
    response = MediaStreamingResponse(upstream, {})

    async def receive():
        return {"type": "http.disconnect"}

    async def send(event):
        if event["type"] == failure_event:
            raise OSError("browser closed connection")

    with pytest.raises(ClientDisconnect):
        await response({"type": "http", "asgi": {"spec_version": "2.4"}}, receive, send)
    assert stream.closed


async def test_older_asgi_disconnect_cancellation_still_closes_upstream():
    stream = TrackedStream()
    response = MediaStreamingResponse(httpx.Response(200, stream=stream), {})

    async def receive():
        return {"type": "http.disconnect"}

    async def send(event):
        await anyio.sleep(0)

    await response({"type": "http", "asgi": {"spec_version": "2.0"}}, receive, send)
    assert stream.closed


@pytest.mark.parametrize(
    "validator, initial, expected",
    [
        ('"v1"', 206, 206),
        ('"outdated"', 206, 200),
        ('W/"v1"', 206, 200),
        ("Mon, 19 Oct 2026 00:00:00 GMT", 206, 206),
        ("Sun, 18 Oct 2026 00:00:00 GMT", 206, 200),
        ("Tue, 20 Oct 2026 00:00:00 GMT", 206, 200),
        ("invalid-date", 206, 200),
        ('"v1"', 416, 416),
        ('"outdated"', 416, 200),
    ],
)
async def test_if_range_with_s3_that_ignores_validator_and_omits_416_size(
    validator, initial, expected
):
    streams = []
    requests = []
    metadata = {
        "etag": '"v1"',
        "last-modified": "Mon, 19 Oct 2026 00:00:00 GMT",
        "content-type": "audio/wav",
    }

    async def upstream(request):
        requests.append(request)
        if request.method == "HEAD":
            status, data, headers = 200, b"", {"content-length": "5", **metadata}
        elif "range" not in request.headers:
            status, data, headers = 200, b"audio", {"content-length": "5", **metadata}
        elif initial == 416:
            status, data, headers = 416, b"internal XML", {}
        else:
            status, data, headers = 206, b"ud", {"content-range": "bytes 1-2/5", **metadata}
        stream = TrackedStream(data)
        streams.append(stream)
        return httpx.Response(status, headers=headers, stream=stream)

    app = create_app()
    app.state.media_store = Minio("minio:9000", "key", "secret", secure=False, region="us-east-1")
    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as remote:
        app.state.media_http = remote
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            result = await client.get(
                "/media/song.wav", headers={"range": "bytes=1-2", "if-range": validator}
            )
    assert result.status_code == expected
    assert result.content == {200: b"audio", 206: b"ud", 416: b""}[expected]
    if expected == 416:
        assert result.headers["content-range"] == "bytes */5"
    if expected == 200:
        assert "range" not in requests[-1].headers
        assert "if-range" not in requests[-1].headers
    assert all(stream.closed for stream in streams)
