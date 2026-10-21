"""Post-commit cleanup of DB-owned keys, preserving files still in use."""

import logging

from sqlalchemy import select, union_all

from app.models import Artist, Banner, Playlist, Song, User
from app.services.avatar import remove_avatar

logger = logging.getLogger(__name__)


async def cleanup(session, request, keys):
    candidates = {key for key in keys if key}
    if not candidates:
        return
    columns = (
        Artist.avatar_key,
        Song.cover_key,
        Song.audio_key,
        Playlist.cover_key,
        Banner.banner_key,
        User.avatar_key,
    )
    try:
        referenced = set(
            await session.scalars(
                union_all(*[select(column).where(column.in_(candidates)) for column in columns])
            )
        )
    except Exception:
        await session.rollback()
        logger.warning("Could not check obsolete media references after commit", exc_info=True)
        return
    for key in sorted(candidates - referenced):
        await remove_avatar(request, key)
