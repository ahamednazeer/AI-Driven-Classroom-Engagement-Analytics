"""Classroom database model."""

from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Index
)
from sqlalchemy.orm import relationship

from app.database import Base


class Classroom(Base):
    __tablename__ = "classrooms"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), unique=True, nullable=False, index=True)
    department = Column(String(100), nullable=True, index=True)
    section = Column(String(50), nullable=True, index=True)
    batch = Column(String(20), nullable=True, index=True)
    description = Column(Text, nullable=True)
    teacher_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    teacher = relationship("User", back_populates="classrooms", foreign_keys=[teacher_id])
    students = relationship("User", back_populates="classroom", foreign_keys="User.classroom_id")

    __table_args__ = (
        Index("ix_classrooms_department_section", "department", "section"),
    )

    def __repr__(self):
        return f"<Classroom(id={self.id}, name='{self.name}', teacher_id={self.teacher_id})>"
