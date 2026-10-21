import pytest
from pydantic import ValidationError
from sqlalchemy import select

from app.core.security import verify_password
from app.manage_admin import provision
from app.models import Admin


async def test_first_admin_has_no_default_password_and_existing_accounts_are_protected(
    database_session,
):
    session = database_session
    await provision(session, "owner_admin", "Strong123!")
    row = await session.scalar(select(Admin).where(Admin.username == "owner_admin"))
    assert row is not None and row.password.startswith("$argon2id$")
    assert (await verify_password("Strong123!", row.password))[0]
    with pytest.raises(ValueError, match="管理员已存在"):
        await provision(session, "second_admin", "Strong456!")
    assert list(await session.scalars(select(Admin.username))) == ["owner_admin"]


async def test_explicit_replace_retires_old_admins_atomically(database_session):
    session = database_session
    session.add(Admin(username="legacy_demo", password="old-demo-hash"))
    await session.flush()
    with pytest.raises(ValidationError):
        await provision(session, "bad", "weak", replace=True)
    assert await session.scalar(select(Admin.username)) == "legacy_demo"
    await provision(session, "new_owner", "NewStrong123!", replace=True)
    assert list(await session.scalars(select(Admin.username))) == ["new_owner"]
