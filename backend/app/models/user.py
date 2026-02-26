"""User and LoginTrack database models with enums for roles and account statuses."""

import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, Text, Index, JSON
)
from sqlalchemy.orm import relationship
from app.database import Base


class UserRole(str, enum.Enum):
    """System roles."""
    ADMIN = "ADMIN"
    TEACHER = "TEACHER"
    STUDENT = "STUDENT"


class AccountStatus(str, enum.Enum):
    """Account lifecycle states."""
    PENDING_FIRST_LOGIN = "PENDING_FIRST_LOGIN"
    PROFILE_SETUP_REQUIRED = "PROFILE_SETUP_REQUIRED"
    FACE_PENDING = "FACE_PENDING"
    ACTIVE = "ACTIVE"
    LOCKED = "LOCKED"
    SUSPENDED = "SUSPENDED"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)

    role = Column(Enum(UserRole), nullable=False, default=UserRole.STUDENT, index=True)
    account_status = Column(
        Enum(AccountStatus),
        nullable=False,
        default=AccountStatus.PENDING_FIRST_LOGIN,
        index=True,
    )

    # Password management
    is_temp_password = Column(Boolean, default=True)
    failed_login_attempts = Column(Integer, default=0)
    locked_at = Column(DateTime(timezone=True), nullable=True)

    # Face recognition
    face_image_url = Column(String(500), nullable=True)
    face_approved = Column(Boolean, default=False)
    face_approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    face_rejected_reason = Column(Text, nullable=True)
    face_embedding = Column(JSON, nullable=True)

    # Profile details
    department = Column(String(100), nullable=True)
    student_id = Column(String(50), nullable=True, unique=True)
    batch = Column(String(20), nullable=True)
    class_section = Column(String(50), nullable=True)
    classroom_id = Column(Integer, ForeignKey("classrooms.id", ondelete="SET NULL"), nullable=True, index=True)
    phone = Column(String(20), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    login_tracks = relationship("LoginTrack", back_populates="user", cascade="all, delete-orphan")
    face_approver = relationship("User", remote_side=[id], foreign_keys=[face_approved_by])
    classrooms = relationship("Classroom", back_populates="teacher", foreign_keys="Classroom.teacher_id")
    classroom = relationship("Classroom", back_populates="students", foreign_keys=[classroom_id])

    # Composite indexes for common queries
    __table_args__ = (
        Index("ix_users_role_status", "role", "account_status"),
        Index("ix_users_class_section", "class_section"),
    )

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', role={self.role})>"


class LoginTrack(Base):
    __tablename__ = "login_tracks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    login_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    ip_address = Column(String(45), nullable=True)  # IPv6 compatible
    user_agent = Column(String(500), nullable=True)
    success = Column(Boolean, nullable=False)
    failure_reason = Column(String(200), nullable=True)

    # Relationship
    user = relationship("User", back_populates="login_tracks")

    __table_args__ = (
        Index("ix_login_tracks_user_time", "user_id", "login_at"),
    )

    def __repr__(self):
        return f"<LoginTrack(user_id={self.user_id}, success={self.success}, at={self.login_at})>"
