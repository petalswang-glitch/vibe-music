from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Admin, Style, User

pytestmark = pytest.mark.integration


@pytest.mark.parametrize(
    ("model", "field", "first", "second"),
    [
        (Admin, "username", "Alice", "alice"),
        (Admin, "username", "café", "cafe"),
        (Style, "name", "Café", "CAFE"),
        (User, "username", "迁移Café", "迁移cafe"),
        (User, "email", "café@example.test", "CAFE@example.test"),
    ],
)
async def test_database_rejects_case_and_accent_variants(
    database_session, model, field, first, second
):
    if model is User:
        now = datetime(2025, 4, 30, 16, 6, 31)
        defaults = {
            "username": "用户1",
            "password": "legacy-md5",
            "email": "user1@example.test",
            "create_time": now,
            "update_time": now,
            "status": 0,
        }
        other = {**defaults, "username": "用户2", "email": "user2@example.test"}
    elif model is Admin:
        defaults = other = {"password": "legacy-md5"}
    else:
        defaults = other = {}
    database_session.add(model(**{**defaults, field: first}))
    await database_session.flush()
    with pytest.raises(IntegrityError):
        async with database_session.begin_nested():
            database_session.add(model(**{**other, field: second}))
            await database_session.flush()
