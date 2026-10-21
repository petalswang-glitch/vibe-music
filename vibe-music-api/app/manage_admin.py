"""Offline administrator provisioning; no registration endpoint or default password."""

import argparse
import asyncio
import getpass

from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.security import hash_password
from app.models import Admin
from app.schemas.admin import AdminLogin


async def provision(session, username: str, password: str, *, replace=False):
    # Reuse the login constraints so an operator cannot create an unusable account.
    AdminLogin(username=username, password=password)
    # One transaction + table lock makes concurrent first-boot commands deterministic.
    from sqlalchemy import text

    await session.execute(text("LOCK TABLE tb_admin IN EXCLUSIVE MODE"))
    existing = await session.scalar(select(func.count()).select_from(Admin))
    if existing and not replace:
        raise ValueError("管理员已存在；如需替换所有管理员，请显式使用 --replace-all。")
    encoded = await hash_password(password)
    if replace:
        await session.execute(delete(Admin))
    session.add(Admin(username=username, password=encoded))
    await session.flush()


async def run(username: str, password: str, replace: bool):
    engine = create_async_engine(get_settings().database_url)
    try:
        async with async_sessionmaker(engine).begin() as session:
            await provision(session, username, password, replace=replace)
        print("管理员已安全创建；密码未写入配置或日志。")
    finally:
        await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", required=True)
    parser.add_argument(
        "--replace-all",
        action="store_true",
        help="删除现有所有管理员并创建此账号；旧管理员无法登录",
    )
    args = parser.parse_args()
    password = getpass.getpass("管理员密码（输入不显示）：")
    if password != getpass.getpass("再次输入密码："):
        parser.exit(1, "两次密码不一致，未作修改。\n")
    try:
        # Validate before opening a DB connection; validation errors never print input.
        AdminLogin(username=args.username, password=password)
        asyncio.run(run(args.username, password, args.replace_all))
    except ValidationError:
        parser.exit(1, "用户名需4～16位字母/数字/_/-；密码须符合项目登录规则，未作修改。\n")
    except ValueError as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
