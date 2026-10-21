from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Identity, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Admin(Base):
    __tablename__ = "tb_admin"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    username: Mapped[str] = mapped_column(String(20, collation="legacy_ci"), unique=True)
    # Legacy MD5 is copied as-is; reserve room for Argon2 upgrades at login.
    password: Mapped[str] = mapped_column(String(255))


class User(Base):
    __tablename__ = "tb_user"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    username: Mapped[str] = mapped_column(String(20, collation="legacy_ci"), unique=True)
    password: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(11, collation="legacy_ci"), unique=True)
    email: Mapped[str] = mapped_column(String(128, collation="legacy_ci"), unique=True)
    user_avatar: Mapped[str | None] = mapped_column(String(255))
    introduction: Mapped[str | None] = mapped_column(String(255))
    create_time: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    update_time: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    status: Mapped[int] = mapped_column(SmallInteger)
    avatar_key: Mapped[str | None] = mapped_column(String(1024))
