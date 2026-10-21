from typing import Literal

from pydantic import Field

from app.schemas.admin_user import Status
from app.schemas.song import ApiModel


class BannerQuery(ApiModel):
    page_num: int = Field(ge=1, le=2**31 - 1)
    page_size: int = Field(ge=1, le=100)
    banner_status: Status | None = None


class ManagedBanner(ApiModel):
    banner_id: int
    banner_url: str
    banner_status: Literal["ENABLE", "DISABLE"]
