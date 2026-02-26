"""Pydantic schemas for request/response validation."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, ConfigDict


# ─── Auth Schemas ─────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=4, max_length=128)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=4, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128, description="Must be at least 8 characters")


class TokenPayload(BaseModel):
    sub: str  # user id
    role: str
    exp: datetime


# ─── User Schemas ─────────────────────────────────────────────────────────────

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)
    role: str = Field(..., pattern="^(ADMIN|TEACHER|STUDENT)$")


class UserCreate(UserBase):
    password: Optional[str] = Field(None, min_length=8, max_length=128, description="If omitted, a temp password is generated")
    department: Optional[str] = Field(None, max_length=100)
    student_id: Optional[str] = Field(None, max_length=50)
    batch: Optional[str] = Field(None, max_length=20)
    class_section: Optional[str] = Field(None, max_length=50)
    classroom_id: Optional[int] = None
    phone: Optional[str] = Field(None, max_length=20)


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    first_name: Optional[str] = Field(None, min_length=1, max_length=50)
    last_name: Optional[str] = Field(None, min_length=1, max_length=50)
    role: Optional[str] = Field(None, pattern="^(ADMIN|TEACHER|STUDENT)$")
    password: Optional[str] = Field(None, min_length=8, max_length=128)
    department: Optional[str] = Field(None, max_length=100)
    student_id: Optional[str] = Field(None, max_length=50)
    batch: Optional[str] = Field(None, max_length=20)
    class_section: Optional[str] = Field(None, max_length=50)
    classroom_id: Optional[int] = None
    phone: Optional[str] = Field(None, max_length=20)


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    first_name: str
    last_name: str
    role: str
    account_status: str
    is_temp_password: bool
    department: Optional[str] = None
    student_id: Optional[str] = None
    batch: Optional[str] = None
    class_section: Optional[str] = None
    classroom_id: Optional[int] = None
    phone: Optional[str] = None
    face_image_url: Optional[str] = None
    face_approved: bool = False
    face_rejected_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_login_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class UserListResponse(BaseModel):
    users: List[UserResponse]
    total: int
    page: int
    per_page: int


class AccountStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(ACTIVE|SUSPENDED|LOCKED)$")
    reason: Optional[str] = Field(None, max_length=500)


class FaceApprovalRequest(BaseModel):
    approved: bool
    rejection_reason: Optional[str] = Field(None, max_length=500)


# ─── Profile Schemas ──────────────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=50)
    last_name: Optional[str] = Field(None, min_length=1, max_length=50)
    phone: Optional[str] = Field(None, max_length=20)
    department: Optional[str] = Field(None, max_length=100)


class ProfileSetupComplete(BaseModel):
    """Sent after user completes profile — transitions to FACE_PENDING or ACTIVE depending on role."""
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)
    phone: Optional[str] = Field(None, max_length=20)
    department: Optional[str] = Field(None, max_length=100)


# ─── Stats Schemas ────────────────────────────────────────────────────────────

class UserStats(BaseModel):
    total: int
    by_role: dict
    by_status: dict
    recent_logins: int  # last 24h


class SystemStats(BaseModel):
    users: UserStats


# ─── Login Track Schemas ──────────────────────────────────────────────────────

class LoginTrackResponse(BaseModel):
    id: int
    user_id: int
    login_at: datetime
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    success: bool
    failure_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class LoginHistoryResponse(BaseModel):
    tracks: List[LoginTrackResponse]
    total: int
