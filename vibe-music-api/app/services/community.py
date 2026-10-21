from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError

from app.core.security import BusinessError
from app.models import Comment, Feedback


async def add_comment(session, user_id, target_id, content, *, playlist=False):
    session.add(
        Comment(
            user_id=user_id,
            song_id=None if playlist else target_id,
            playlist_id=target_id if playlist else None,
            type=int(playlist),
            content=content,
            create_time=datetime.now(),
            like_count=0,
        )
    )
    try:
        await session.commit()
    except IntegrityError:
        # A missing/deleted target should return a business failure, not an FK 500.
        await session.rollback()
        raise BusinessError("添加失败") from None


async def count_like(session, comment_id, delta):
    # Preserve the legacy counter (including repeated likes/cancels), but make
    # each increment atomic so simultaneous users cannot overwrite one another.
    changed = await session.scalar(
        update(Comment)
        .where(Comment.id == comment_id)
        .values(like_count=func.coalesce(Comment.like_count, 0) + delta)
        .returning(Comment.id)
    )
    if changed is None:
        raise BusinessError("NOT_FOUND")
    await session.commit()


async def delete_comment(session, user_id, comment_id):
    row = await session.scalar(select(Comment).where(Comment.id == comment_id).with_for_update())
    if row is None:
        raise BusinessError("NOT_FOUND")
    if row.user_id != user_id:
        raise BusinessError("您没有权限访问此资源")
    await session.execute(delete(Comment).where(Comment.id == comment_id))
    await session.commit()


async def add_feedback(session, user_id, content):
    session.add(Feedback(user_id=user_id, feedback=content, create_time=datetime.now()))
    await session.commit()
