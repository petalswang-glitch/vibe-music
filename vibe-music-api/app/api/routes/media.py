from datetime import timedelta
from email.utils import parsedate_to_datetime

import anyio
import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from starlette.types import Receive, Scope, Send

router = APIRouter(prefix="/media", tags=["media"])
REQUEST_HEADERS = {"range", "if-range", "if-none-match", "if-modified-since"}
RESPONSE_HEADERS = {
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
    "cache-control",
    "content-encoding",
}


class MediaStreamingResponse(StreamingResponse):
    def __init__(self, upstream: httpx.Response, headers: dict[str, str]):
        super().__init__(upstream.aiter_raw(), status_code=upstream.status_code, headers=headers)
        self.upstream = upstream

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            # Browser seeks cancel old requests. Close even when ASGI send fails,
            # rather than relying on a background task that disconnect can skip.
            with anyio.CancelScope(shield=True):
                await self.upstream.aclose()


def validate_object_key(key: str) -> str:
    if (
        not key
        or len(key.encode("utf-8")) > 1024
        or any(part in {"", ".", ".."} for part in key.split("/"))
        or "\\" in key
        or any(ord(char) < 32 or ord(char) == 127 for char in key)
    ):
        raise HTTPException(400, "媒体路径无效")
    return key


def if_range_matches(value: str, headers: httpx.Headers) -> bool:
    if value.startswith('"'):
        return value == headers.get("etag")
    if value.startswith("W/"):
        return False
    try:
        return parsedate_to_datetime(value) == parsedate_to_datetime(headers["last-modified"])
    except (ValueError, TypeError, KeyError, OverflowError):
        return False


@router.head("/{object_key:path}", include_in_schema=False)
@router.get("/{object_key:path}")
async def read_media(object_key: str, request: Request):
    key = validate_object_key(object_key)
    # The signed internal URL never reaches the browser. Region is set explicitly so
    # signing performs no synchronous network lookup in the async request handler.
    client = request.app.state.media_http

    async def fetch(method: str, headers: dict[str, str]):
        url = request.app.state.media_store.get_presigned_url(
            method,
            request.app.state.settings.minio_bucket,
            key,
            expires=timedelta(minutes=5),
        )
        try:
            return await client.send(
                client.build_request(method, url, headers=headers), stream=True
            )
        except httpx.RequestError:
            raise HTTPException(502, "媒体服务暂时不可用") from None

    forwarded = {name: value for name, value in request.headers.items() if name in REQUEST_HEADERS}
    validator = forwarded.get("if-range")
    upstream = await fetch(request.method, forwarded)
    if upstream.status_code == 416:
        # MinIO's S3 InvalidRange response omits the HTTP total-size header.
        await upstream.aclose()
        metadata = await fetch("HEAD", {})
        await metadata.aclose()
        size = metadata.headers.get("content-length", "")
        if metadata.status_code != 200 or not size.isascii() or not size.isdigit():
            raise HTTPException(502, "媒体服务暂时不可用")
        if not validator or if_range_matches(validator, metadata.headers):
            return Response(
                status_code=416,
                headers={
                    "content-range": f"bytes */{size}",
                    "accept-ranges": "bytes",
                    "x-content-type-options": "nosniff",
                },
            )
        # A stale If-Range must return the whole current object, even when the
        # supplied byte range would be out of bounds for this version.
        forwarded.pop("range", None)
        forwarded.pop("if-range", None)
        upstream = await fetch(request.method, forwarded)
    elif (
        upstream.status_code == 206
        and validator
        and not if_range_matches(validator, upstream.headers)
    ):
        # S3 does not implement If-Range. Compare its actual response validators
        # and discard the partial stream before retrying without a byte range.
        await upstream.aclose()
        forwarded.pop("range", None)
        forwarded.pop("if-range", None)
        upstream = await fetch(request.method, forwarded)
    headers = {name: value for name, value in upstream.headers.items() if name in RESPONSE_HEADERS}
    headers["x-content-type-options"] = "nosniff"
    if upstream.status_code not in {200, 206, 304, 416}:
        status = upstream.status_code
        await upstream.aclose()
        raise HTTPException(
            404 if status == 404 else 502,
            "媒体资源不存在" if status == 404 else "媒体服务暂时不可用",
        )
    if request.method == "HEAD" or upstream.status_code == 304:
        await upstream.aclose()
        return Response(status_code=upstream.status_code, headers=headers)

    return MediaStreamingResponse(upstream, headers)
