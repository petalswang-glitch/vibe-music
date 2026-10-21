from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.schemas.song import PageResult, Result, SongQuery, SongView
from app.services.auth import optional_user_id
from app.services.favorite import mark_songs
from app.services.song import get_all_songs

router = APIRouter(prefix="/song", tags=["songs"])


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
