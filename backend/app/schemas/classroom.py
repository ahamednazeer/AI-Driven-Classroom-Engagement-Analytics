"""Pydantic schemas for classroom management."""

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field, ConfigDict, EmailStr


class ClassroomTeacherInfo(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: EmailStr

    model_config = ConfigDict(from_attributes=True)


class ClassroomBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    department: Optional[str] = Field(None, max_length=100)
    section: Optional[str] = Field(None, max_length=50)
    batch: Optional[str] = Field(None, max_length=20)
    description: Optional[str] = Field(None, max_length=500)
    teacher_id: Optional[int] = None
    is_active: Optional[bool] = True


class ClassroomCreate(ClassroomBase):
    pass


class ClassroomUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    department: Optional[str] = Field(None, max_length=100)
    section: Optional[str] = Field(None, max_length=50)
    batch: Optional[str] = Field(None, max_length=20)
    description: Optional[str] = Field(None, max_length=500)
    teacher_id: Optional[int] = None
    is_active: Optional[bool] = None


class ClassroomResponse(BaseModel):
    id: int
    name: str
    department: Optional[str] = None
    section: Optional[str] = None
    batch: Optional[str] = None
    description: Optional[str] = None
    teacher_id: Optional[int] = None
    teacher: Optional[ClassroomTeacherInfo] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ClassroomListResponse(BaseModel):
    classes: List[ClassroomResponse]
    total: int
    page: int
    per_page: int


class AssignTeacherRequest(BaseModel):
    teacher_id: Optional[int] = None
