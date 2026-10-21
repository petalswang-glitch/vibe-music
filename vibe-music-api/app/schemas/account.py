import re
from typing import Annotated

from pydantic import AfterValidator, EmailStr, Field, field_validator

from app.schemas.song import ApiModel


def password_format(value: str) -> str:
    # Match the actual Java/JS expression, including its underscore/symbol behavior.
    if not re.fullmatch(r"(?![0-9]+$)(?![a-zA-Z]+$)[0-9A-Za-z\W]{8,18}", value, re.ASCII):
        raise ValueError("密码格式不正确")
    return value


Password = Annotated[str, AfterValidator(password_format)]
Email = Annotated[EmailStr, Field(max_length=128)]
Code = Annotated[str, Field(pattern=r"^[0-9a-zA-Z]{6}$")]


class LoginInput(ApiModel):
    email: Email
    password: Password


class RegisterInput(LoginInput):
    username: str = Field(pattern=r"^[a-zA-Z0-9_-]{4,16}$")
    verification_code: Code


class ResetPasswordInput(ApiModel):
    email: Email
    verification_code: Code
    new_password: Password
    repeat_password: Password


class ChangePasswordInput(ApiModel):
    old_password: Password
    new_password: Password
    repeat_password: Password


class UserView(ApiModel):
    user_id: int
    username: str
    phone: str | None
    email: str
    user_avatar: str | None
    introduction: str | None


class ProfileInput(ApiModel):
    user_id: int | None = None
    username: str = Field(pattern=r"^[a-zA-Z0-9_-]{4,16}$")
    email: Email
    phone: str | None = Field(default=None, pattern=r"^1[3-9][0-9]{9}$")
    introduction: str | None = Field(default=None, pattern=r"^.{0,100}$")

    @field_validator("phone", mode="before")
    @classmethod
    def blank_phone(cls, value):
        return None if value == "" else value
