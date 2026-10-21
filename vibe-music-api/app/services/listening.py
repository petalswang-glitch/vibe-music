from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.core.security import BusinessError
from app.models import ListeningHistory, Song


async def record_listening(session, user_id: int, song_id: int):
    song = await session.scalar(select(Song).where(Song.id == song_id).with_for_update())
    if song is None or not song.audio_key:
        raise BusinessError("音频资源不可用")
    now = datetime.now(UTC)
    statement = insert(ListeningHistory).values(
        user_id=user_id, song_id=song_id, play_count=1, last_played_at=now
    )
    await session.execute(
        statement.on_conflict_do_update(
            index_elements=[ListeningHistory.user_id, ListeningHistory.song_id],
            set_={"play_count": ListeningHistory.play_count + 1, "last_played_at": now},
            where=ListeningHistory.last_played_at <= now - timedelta(minutes=30),
        )
    )
    await session.commit()


async def recent_song_ids(session, user_id: int):
    return list(
        await session.scalars(
            select(ListeningHistory.song_id)
            .where(ListeningHistory.user_id == user_id)
            .order_by(ListeningHistory.last_played_at.desc(), ListeningHistory.song_id.desc())
            .limit(100)
        )
    )
