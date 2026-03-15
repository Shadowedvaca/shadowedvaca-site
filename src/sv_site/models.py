"""SQLAlchemy ORM models for sv_site.

shadowedvaca schema: users, invite_codes
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# shadowedvaca.users
# ---------------------------------------------------------------------------


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "shadowedvaca"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )

    invite_codes_created: Mapped[list["InviteCode"]] = relationship(
        back_populates="created_by", foreign_keys="InviteCode.created_by_user_id"
    )


# ---------------------------------------------------------------------------
# shadowedvaca.invite_codes
# ---------------------------------------------------------------------------


class InviteCode(Base):
    __tablename__ = "invite_codes"
    __table_args__ = {"schema": "shadowedvaca"}

    code: Mapped[str] = mapped_column(String(16), primary_key=True)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("shadowedvaca.users.id", ondelete="SET NULL")
    )
    used_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    expires_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))

    created_by: Mapped[Optional[User]] = relationship(
        back_populates="invite_codes_created", foreign_keys=[created_by_user_id]
    )
