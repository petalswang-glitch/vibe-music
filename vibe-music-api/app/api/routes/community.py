from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.schemas.community import PlaylistComment, SongComment
from app.schemas.song import Result
from app.services import community as service
from app.services.auth import locked_user

router = APIRouter(tags=["comments", "feedback"])
Session = Annotated[AsyncSession, Depends(get_session)]


@router.post("/comment/addSongComment", response_model=Result[None])
async def add_song(query: SongComment, request: Request, session: Session):
    user = await locked_user(request, session)
    await service.add_comment(session, user.id, query.song_id, query.content)
    return Result(message="添加成功", data=None)


@router.post("/comment/addPlaylistComment", response_model=Result[None])
async def add_playlist(query: PlaylistComment, request: Request, session: Session):
    user = await locked_user(request, session)
    await service.add_comment(session, user.id, query.playlist_id, query.content, playlist=True)
    return Result(message="添加成功", data=None)


@router.patch("/comment/likeComment/{id}", response_model=Result[None])
async def like(id: int, request: Request, session: Session):
    await locked_user(request, session)
    await service.count_like(session, id, 1)
    return Result(message="成功", data=None)


@router.patch("/comment/cancelLikeComment/{id}", response_model=Result[None])
async def cancel_like(id: int, request: Request, session: Session):
    await locked_user(request, session)
    await service.count_like(session, id, -1)
    return Result(message="成功", data=None)


@router.delete("/comment/deleteComment/{id}", response_model=Result[None])
async def delete_comment(id: int, request: Request, session: Session):
    user = await locked_user(request, session)
    await service.delete_comment(session, user.id, id)
    return Result(message="删除成功", data=None)


@router.post("/feedback/addFeedback", response_model=Result[None])
async def add_feedback(
    content: Annotated[str, Query(max_length=255)], request: Request, session: Session
):
    user = await locked_user(request, session)
    await service.add_feedback(session, user.id, content)
    return Result(message="添加成功", data=None)
