from datetime import datetime
from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, field_validator

from app.schemas.account import Email, Password
from app.schemas.admin import LegacyId
from app.schemas.song import ApiModel


def status_value(value):
    if type(value) is bool:
        raise ValueError("invalid user status")
    if value in (0, "0", "ENABLE"):
        return 0
    if value in (1, "1", "DISABLE"):
        return 1
    raise ValueError("invalid user status")


Status = Annotated[Literal[0, 1], BeforeValidator(status_value)]


class UserQuery(ApiModel):
    page_num: int = Field(ge=1, le=2**31 - 1)
    page_size: int = Field(ge=1, le=2**31 - 1)
    username: str | None = None
    phone: str | None = None
    user_status: Status | None = None


class UserFields(ApiModel):
    username: str = Field(pattern=r"^[a-zA-Z0-9_-]{4,16}$")
    email: Email
    phone: str | None = Field(default=None, pattern=r"^1[3-9][0-9]{9}$")
    introduction: str | None = Field(default=None, pattern=r"^.{0,100}$")

    @field_validator("phone", mode="before")
    @classmethod
    def blank_phone(cls, value):
        return None if value == "" else value


class UserAdd(UserFields):
    password: Password
    user_status: Status = 1


class UserUpdate(UserFields):
    user_id: LegacyId


class ManagedUser(ApiModel):
    user_id: int
    username: str
    phone: str | None
    email: str
    user_avatar: str | None
    introduction: str | None
    create_time: datetime
    update_time: datetime
    # Original Jackson serializes these enum names; DB values stay 0/1.
    user_status: Literal["ENABLE", "DISABLE"]
