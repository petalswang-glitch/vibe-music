from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ListeningHistory(Base):
    __tablename__ = "tb_listening_history"
    __table_args__ = (Index("ix_listening_history_user_time", "user_id", "last_played_at"),)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("tb_user.id", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True
    )
    song_id: Mapped[int] = mapped_column(
        ForeignKey("tb_song.id", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True
    )
    play_count: Mapped[int] = mapped_column(BigInteger)
    last_played_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
