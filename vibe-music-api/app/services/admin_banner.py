import io
import uuid

from fastapi import HTTPException
from sqlalchemy import delete, select
from starlette.concurrency import run_in_threadpool

from app.core.security import BusinessError
from app.models import Banner
from app.repositories.catalogue import page
from app.schemas.admin_banner import ManagedBanner
from app.schemas.song import PageResult, Result
from app.services.admin_media import cleanup
from app.services.avatar import read_avatar, remove_avatar


async def listing(session, query):
    statement = select(Banner.id.label("banner_id"), Banner.banner_url, Banner.status)
    if query.banner_status is not None:
        statement = statement.where(Banner.status == query.banner_status)
    total, rows = await page(session, statement, query.page_num, query.page_size, Banner.id.desc())
    if not rows:
        return Result(message="未找到相关数据", data=PageResult(total=0, items=None))
    return Result(
        data=PageResult(
            total=total,
            items=[
                ManagedBanner(
                    banner_id=row["banner_id"],
                    banner_url=row["banner_url"],
                    banner_status="ENABLE" if row["status"] == 0 else "DISABLE",
                )
                for row in rows
            ],
        )
    )


async def locked(session, identity):
    row = await session.scalar(
        select(Banner)
        .where(Banner.id == identity)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if row is None:
        raise BusinessError("更新失败")
    return row


async def upload(session, request, file, identity=None):
    row = await locked(session, identity) if identity is not None else Banner(status=0)
    data = await read_avatar(file, label="轮播图", max_size=(2048, 2048))
    key = f"banners/{uuid.uuid4().hex}.png"
    previous = row.banner_key
    try:
        await run_in_threadpool(
            request.app.state.media_store.put_object,
            request.app.state.settings.minio_bucket,
            key,
            io.BytesIO(data),
            len(data),
            content_type="image/png",
        )
    except Exception:
        raise HTTPException(502, "轮播图上传失败，请稍后重试") from None
    row.banner_key, row.banner_url = key, f"/media/{key}"
    session.add(row)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        await remove_avatar(request, key)
        raise
    await cleanup(session, request, [previous])


async def status(session, identity, value):
    if value not in (0, 1):
        raise BusinessError("轮播图状态无效")
    row = await locked(session, identity)
    row.status = value
    await session.commit()


async def remove(session, request, ids, *, single=False):
    try:
        rows = (
            await session.scalars(
                select(Banner).where(Banner.id.in_(ids)).order_by(Banner.id).with_for_update()
            )
        ).all()
        if not rows:
            raise BusinessError("未找到相关数据" if single else "删除失败")
        keys = [row.banner_key for row in rows]
        await session.execute(delete(Banner).where(Banner.id.in_([row.id for row in rows])))
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    await cleanup(session, request, keys)
