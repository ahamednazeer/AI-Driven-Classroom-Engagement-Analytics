"""Session management and engagement tracking models."""

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Float,
    JSON,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class SessionStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    LIVE = "LIVE"
    ENDED = "ENDED"
    CANCELLED = "CANCELLED"


class ClassSession(Base):
    __tablename__ = "class_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_code = Column(String(20), unique=True, index=True, nullable=False)
    class_id = Column(Integer, ForeignKey("classrooms.id", ondelete="SET NULL"), nullable=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    course = Column(String(120), nullable=False)
    subject = Column(String(120), nullable=False)
    topic = Column(String(200), nullable=False)

    scheduled_start = Column(DateTime(timezone=True), nullable=False)
    scheduled_end = Column(DateTime(timezone=True), nullable=False)
    tracking_enabled = Column(Boolean, default=True)

    status = Column(String(20), default=SessionStatus.SCHEDULED.value, index=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    classroom = relationship("Classroom")
    teacher = relationship("User")
    participants = relationship("SessionParticipant", back_populates="session", cascade="all, delete-orphan")
    signals = relationship("EngagementSignal", back_populates="session", cascade="all, delete-orphan")
    summary = relationship("SessionSummary", back_populates="session", uselist=False, cascade="all, delete-orphan")
    quizzes = relationship("SessionQuiz", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_sessions_teacher_status", "teacher_id", "status"),
        Index("ix_sessions_class_status", "class_id", "status"),
    )


class SessionParticipant(Base):
    __tablename__ = "session_participants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("class_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    joined_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    attendance_mark = Column(Boolean, default=True)
    auth_type = Column(String(20), nullable=True)  # password / face
    device_info = Column(JSON, nullable=True)

    session = relationship("ClassSession", back_populates="participants")
    student = relationship("User")

    __table_args__ = (
        UniqueConstraint("session_id", "student_id", name="uq_session_student"),
        Index("ix_session_participant_session_student", "session_id", "student_id"),
    )


class EngagementSignal(Base):
    __tablename__ = "engagement_signals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("class_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    visual_attention = Column(Float, nullable=False)
    participation = Column(Float, nullable=False)
    quiz_accuracy = Column(Float, nullable=False)
    attendance_consistency = Column(Float, nullable=False)

    engagement_score = Column(Float, nullable=False)
    category = Column(String(20), nullable=False)

    raw = Column(JSON, nullable=True)

    session = relationship("ClassSession", back_populates="signals")
    student = relationship("User")

    __table_args__ = (
        Index("ix_engagement_session_student_time", "session_id", "student_id", "timestamp"),
    )


class SessionSummary(Base):
    __tablename__ = "session_summaries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("class_sessions.id", ondelete="CASCADE"), nullable=False, unique=True)
    average_engagement = Column(Float, nullable=False)
    distracted_percent = Column(Float, nullable=False)
    trend = Column(JSON, nullable=True)
    computed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    session = relationship("ClassSession", back_populates="summary")


class SessionQuiz(Base):
    __tablename__ = "session_quizzes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("class_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    question = Column(String(500), nullable=False)
    options = Column(JSON, nullable=False)
    correct_option_index = Column(Integer, nullable=False)
    duration_seconds = Column(Integer, nullable=False, default=60)
    expires_at = Column(DateTime(timezone=True), nullable=True, index=True)
    is_active = Column(Boolean, default=True, index=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    closed_at = Column(DateTime(timezone=True), nullable=True)

    session = relationship("ClassSession", back_populates="quizzes")
    teacher = relationship("User")
    responses = relationship("SessionQuizResponse", back_populates="quiz", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_session_quiz_session_active", "session_id", "is_active"),
    )


class SessionQuizResponse(Base):
    __tablename__ = "session_quiz_responses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    quiz_id = Column(Integer, ForeignKey("session_quizzes.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(Integer, ForeignKey("class_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    selected_option_index = Column(Integer, nullable=False)
    is_correct = Column(Boolean, nullable=False)
    answered_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    quiz = relationship("SessionQuiz", back_populates="responses")
    session = relationship("ClassSession")
    student = relationship("User")

    __table_args__ = (
        UniqueConstraint("quiz_id", "student_id", name="uq_quiz_student"),
        Index("ix_quiz_response_session_student", "session_id", "student_id"),
    )
