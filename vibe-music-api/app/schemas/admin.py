from datetime import datetime
from typing import Annotated

from pydantic import Field, field_serializer

from app.schemas.account import Password
from app.schemas.song import ApiModel


class AdminLogin(ApiModel):
    username: str = Field(pattern=r"^[a-zA-Z0-9_-]{4,16}$")
    password: Password


class FeedbackQuery(ApiModel):
    page_num: int = Field(ge=1, le=2**31 - 1)
    page_size: int = Field(ge=1, le=2**31 - 1)
    keyword: str | None = None


LegacyId = Annotated[int, Field(ge=-(2**63), le=2**63 - 1)]


class FeedbackView(ApiModel):
    feedback_id: int
    user_id: int
    feedback: str
    create_time: datetime

    @field_serializer("create_time")
    def serialize_time(self, value: datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
