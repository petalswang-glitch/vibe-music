from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.media import read_media
from app.db.session import get_session
from app.models import Song
from app.schemas.song import PageResult, Result, SongQuery, SongView
from app.services.auth import locked_user, optional_user_id
from app.services.favorite import mark_songs
from app.services.listening import record_listening
from app.services.song import get_all_songs

router = APIRouter(prefix="/song", tags=["songs"])
Session = Annotated[AsyncSession, Depends(get_session)]
SongId = Annotated[int, Path(gt=0, le=2**63 - 1)]


@router.post("/{song_id}/listen", response_model=Result[None])
async def listen(song_id: SongId, request: Request, session: Session):
    user = await locked_user(request, session)
    await record_listening(session, user.id, song_id)
    return Result(data=None)


@router.get("/{song_id}/download")
async def download(song_id: SongId, request: Request, session: Session):
    await locked_user(request, session)
    song = await session.get(Song, song_id)
    if song is None or not song.audio_key:
        raise HTTPException(404, "音频资源不可用")
    key, name = song.audio_key, song.name
    # Release the user's row lock before a potentially long audio transfer.
    await session.commit()
    response = await read_media(key, request)
    extension = key.rsplit(".", 1)[-1].lower()
    if extension not in {"mp3", "flac", "wav", "ogg", "m4a", "aac"}:
        extension = "mp3"
    response.headers["Content-Disposition"] = (
        f"attachment; filename*=UTF-8''{quote(name, safe='')}.{extension}"
    )
    response.headers["Cache-Control"] = "private, no-store"
    return response


@router.post("/getAllSongs", response_model=Result[PageResult[SongView]])
async def songs(
    query: SongQuery,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    user_id = await optional_user_id(request, session)
    result = await get_all_songs(session, query)
    await mark_songs(session, user_id, result.data.items)
    response.headers["Cache-Control"] = "private, no-store"
    return result
