import io
import logging

from fastapi import HTTPException, Request, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from app.core.security import BusinessError

logger = logging.getLogger(__name__)
MAX_AVATAR_BYTES = 100 * 1024 * 1024  # Original Spring multipart limit.


def normalize_image(data: bytes, *, label="头像", max_size=(1024, 1024)) -> bytes:
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.width * image.height > 16_000_000:
                raise BusinessError(f"{label}图片像素过大")
            image = ImageOps.exif_transpose(image)
            image.thumbnail(max_size)
            output = io.BytesIO()
            image.convert("RGBA").save(output, format="PNG")
            return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise BusinessError(f"请选择有效的{label}图片") from None


async def read_avatar(avatar: UploadFile, *, label="头像", max_size=(1024, 1024)) -> bytes:
    data = bytearray()
    try:
        while chunk := await avatar.read(1024 * 1024):
            data.extend(chunk)
            if len(data) > MAX_AVATAR_BYTES:
                raise HTTPException(413, f"{label}文件不能超过100MB")
    finally:
        await avatar.close()
    return await run_in_threadpool(normalize_image, bytes(data), label=label, max_size=max_size)


async def remove_avatar(request: Request, key: str | None):
    if not key:
        return
    # Only keys supplied by our DB, never request-controlled URLs.
    try:
        await run_in_threadpool(
            request.app.state.media_store.remove_object,
            request.app.state.settings.minio_bucket,
            key,
        )
    except Exception:
        # DB is already committed: a stale file must not make a successful update
        # appear to fail or roll back the user's new avatar/account deletion.
        logger.warning("Could not remove obsolete avatar object %s", key, exc_info=True)
