from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserAgentConfig(Base):
    __tablename__ = "tb_user_agent_config"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("tb_user.id", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True
    )
    provider: Mapped[str] = mapped_column(String(20))
    model_name: Mapped[str] = mapped_column(String(200))
    encrypted_key: Mapped[str] = mapped_column(Text)
    update_time: Mapped[datetime] = mapped_column(DateTime(timezone=False))
