"""SQLAlchemy ORM models for sv_site.

shadowedvaca schema: users, invite_codes, user_permissions
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
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
    permissions: Mapped[list["UserPermission"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
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
    # Tool slugs granted to the registrant — e.g. ["settings", "ideas"]
    permissions: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")

    created_by: Mapped[Optional[User]] = relationship(
        back_populates="invite_codes_created", foreign_keys=[created_by_user_id]
    )


# ---------------------------------------------------------------------------
# shadowedvaca.user_permissions
# ---------------------------------------------------------------------------


class UserPermission(Base):
    __tablename__ = "user_permissions"
    __table_args__ = {"schema": "shadowedvaca"}

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("shadowedvaca.users.id", ondelete="CASCADE"), primary_key=True
    )
    tool_slug: Mapped[str] = mapped_column(String(64), primary_key=True)

    user: Mapped[User] = relationship(back_populates="permissions")


# ---------------------------------------------------------------------------
# shadowedvaca.customer_feedback
# ---------------------------------------------------------------------------


class CustomerFeedback(Base):
    __tablename__ = "customer_feedback"
    __table_args__ = (
        CheckConstraint("score BETWEEN 1 AND 10", name="ck_cf_score"),
        {"schema": "shadowedvaca"},
    )

    id:                    Mapped[int]             = mapped_column(Integer, primary_key=True)
    program_name:          Mapped[str]             = mapped_column(String(80), nullable=False)
    received_at:           Mapped[datetime]        = mapped_column(
                               TIMESTAMP(timezone=True), server_default=func.now()
                           )
    is_authenticated_user: Mapped[bool]            = mapped_column(Boolean, default=False)
    is_anonymous:          Mapped[bool]            = mapped_column(Boolean, default=False)
    privacy_token:         Mapped[Optional[str]]   = mapped_column(String(64))
    score:                 Mapped[Optional[int]]   = mapped_column(Integer)
    raw_feedback:          Mapped[str]             = mapped_column(Text, nullable=False)
    summary:               Mapped[Optional[str]]   = mapped_column(Text)
    sentiment:             Mapped[Optional[str]]   = mapped_column(String(20))
    tags:                  Mapped[Optional[dict]]  = mapped_column(JSONB)
    processed_at:          Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    processing_error:      Mapped[Optional[str]]   = mapped_column(Text)
