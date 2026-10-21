from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Index, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Favorite(Base):
    __tablename__ = "tb_user_favorite"
    __table_args__ = (
        Index("ix_tb_user_favorite_user_id", "user_id"),
        Index("ix_tb_user_favorite_song_id", "song_id"),
        Index("ix_tb_user_favorite_playlist_id", "playlist_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("tb_user.id", ondelete="CASCADE", onupdate="CASCADE")
    )
    type: Mapped[int] = mapped_column(SmallInteger)
    song_id: Mapped[int | None] = mapped_column(
        ForeignKey("tb_song.id", ondelete="CASCADE", onupdate="CASCADE")
    )
    playlist_id: Mapped[int | None] = mapped_column(
        ForeignKey("tb_playlist.id", ondelete="CASCADE", onupdate="CASCADE")
    )
    create_time: Mapped[datetime] = mapped_column(DateTime(timezone=False))


class Comment(Base):
    __tablename__ = "tb_comment"
    __table_args__ = (
        Index("ix_tb_comment_user_id", "user_id"),
        Index("ix_tb_comment_song_id", "song_id"),
        Index("ix_tb_comment_playlist_id", "playlist_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("tb_user.id", ondelete="CASCADE", onupdate="CASCADE")
    )
    song_id: Mapped[int | None] = mapped_column(
        ForeignKey("tb_song.id", ondelete="CASCADE", onupdate="CASCADE")
    )
    playlist_id: Mapped[int | None] = mapped_column(
        ForeignKey("tb_playlist.id", ondelete="CASCADE", onupdate="CASCADE")
    )
    content: Mapped[str] = mapped_column(String(255))
    create_time: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    type: Mapped[int] = mapped_column(SmallInteger)
    like_count: Mapped[int | None] = mapped_column(BigInteger)


class Banner(Base):
    __tablename__ = "tb_banner"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    banner_url: Mapped[str] = mapped_column(String(255))
    status: Mapped[int] = mapped_column(SmallInteger)
    banner_key: Mapped[str | None] = mapped_column(String(1024))


class Feedback(Base):
    __tablename__ = "tb_feedback"
    __table_args__ = (Index("ix_tb_feedback_user_id", "user_id"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("tb_user.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    feedback: Mapped[str] = mapped_column(String(255))
    create_time: Mapped[datetime] = mapped_column(DateTime(timezone=False))
