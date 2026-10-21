from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, Identity, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Artist(Base):
    __tablename__ = "tb_artist"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    gender: Mapped[int | None] = mapped_column(Integer)
    avatar: Mapped[str | None] = mapped_column(String(255))
    birth: Mapped[date | None] = mapped_column(Date)
    area: Mapped[str | None] = mapped_column(String(30))
    introduction: Mapped[str | None] = mapped_column(String(255))
    avatar_key: Mapped[str | None] = mapped_column(String(1024))


class Song(Base):
    __tablename__ = "tb_song"
    __table_args__ = (Index("ix_tb_song_artist_id", "artist_id"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    artist_id: Mapped[int] = mapped_column(
        ForeignKey("tb_artist.id", ondelete="CASCADE", onupdate="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(255))
    album: Mapped[str] = mapped_column(String(255))
    lyric: Mapped[str | None] = mapped_column(Text)
    duration: Mapped[str | None] = mapped_column(String(10))
    style: Mapped[str | None] = mapped_column(String(255))
    cover_url: Mapped[str | None] = mapped_column(String(255))
    audio_url: Mapped[str | None] = mapped_column(String(255))
    cover_key: Mapped[str | None] = mapped_column(String(1024))
    audio_key: Mapped[str | None] = mapped_column(String(1024))
    release_time: Mapped[date] = mapped_column(Date)


class Style(Base):
    __tablename__ = "tb_style"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(50, collation="legacy_ci"), unique=True)


class Genre(Base):
    __tablename__ = "tb_genre"
    __table_args__ = (Index("ix_tb_genre_style_id", "style_id"),)

    song_id: Mapped[int] = mapped_column(
        ForeignKey("tb_song.id", ondelete="CASCADE", onupdate="RESTRICT"), primary_key=True
    )
    style_id: Mapped[int] = mapped_column(
        ForeignKey("tb_style.id", ondelete="CASCADE", onupdate="RESTRICT"), primary_key=True
    )


class Playlist(Base):
    __tablename__ = "tb_playlist"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    cover_url: Mapped[str | None] = mapped_column(String(255))
    introduction: Mapped[str | None] = mapped_column(Text)
    style: Mapped[str | None] = mapped_column(String(255))
    cover_key: Mapped[str | None] = mapped_column(String(1024))


class PlaylistBinding(Base):
    __tablename__ = "tb_playlist_binding"
    __table_args__ = (Index("ix_tb_playlist_binding_song_id", "song_id"),)

    playlist_id: Mapped[int] = mapped_column(
        ForeignKey("tb_playlist.id", ondelete="CASCADE", onupdate="RESTRICT"), primary_key=True
    )
    song_id: Mapped[int] = mapped_column(
        ForeignKey("tb_song.id", ondelete="CASCADE", onupdate="RESTRICT"), primary_key=True
    )
