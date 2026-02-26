"""User service: business logic for CRUD, status transitions, and face management."""

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Tuple

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User, LoginTrack, UserRole, AccountStatus
from app.models.classroom import Classroom
from app.services.face_service import compute_face_embedding
from app.services.auth_service import hash_password, generate_temp_password


async def create_user(
    db: AsyncSession,
    username: str,
    email: str,
    first_name: str,
    last_name: str,
    role: str,
    password: Optional[str] = None,
    department: Optional[str] = None,
    student_id: Optional[str] = None,
    batch: Optional[str] = None,
    class_section: Optional[str] = None,
    classroom_id: Optional[int] = None,
    phone: Optional[str] = None,
) -> Tuple[User, Optional[str]]:
    """
    Create a new user. If no password provided, generates a temp password.
    Returns (user, temp_password_or_none).
    """
    # Check uniqueness
    existing = await db.execute(
        select(User).where((User.username == username) | (User.email == email))
    )
    if existing.scalar_one_or_none():
        raise ValueError("Username or email already exists")

    # Check student_id uniqueness if provided
    if student_id:
        existing_student = await db.execute(
            select(User).where(User.student_id == student_id)
        )
        if existing_student.scalar_one_or_none():
            raise ValueError("Student ID already exists")

    temp_pass = None
    if password:
        password_hash = hash_password(password)
        is_temp = False
    else:
        temp_pass = generate_temp_password()
        password_hash = hash_password(temp_pass)
        is_temp = True

    user = User(
        username=username,
        email=email,
        password_hash=password_hash,
        first_name=first_name,
        last_name=last_name,
        role=UserRole(role),
        account_status=AccountStatus.PENDING_FIRST_LOGIN if is_temp else AccountStatus.ACTIVE,
        is_temp_password=is_temp,
        department=department,
        student_id=student_id,
        batch=batch,
        class_section=class_section,
        classroom_id=classroom_id,
        phone=phone,
    )

    if classroom_id is not None:
        if role != "STUDENT":
            raise ValueError("Only students can be assigned to classes")
        classroom = await db.execute(select(Classroom).where(Classroom.id == classroom_id))
        classroom_obj = classroom.scalar_one_or_none()
        if not classroom_obj:
            raise ValueError("Class not found")
        if not classroom_obj.teacher_id:
            raise ValueError("Class has no assigned teacher")
        # Sync key fields to class definition
        if classroom_obj.department:
            user.department = classroom_obj.department
        if classroom_obj.section:
            user.class_section = classroom_obj.section
        if classroom_obj.batch and not user.batch:
            user.batch = classroom_obj.batch

    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user, temp_pass


async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    """Get a user by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
    """Get a user by username."""
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_users(
    db: AsyncSession,
    role: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    class_section: Optional[str] = None,
    department: Optional[str] = None,
    classroom_id: Optional[int] = None,
    page: int = 1,
    per_page: int = 50,
) -> Tuple[List[User], int]:
    """Get paginated users with optional filters."""
    query = select(User)
    count_query = select(func.count(User.id))

    filters = []
    if role:
        filters.append(User.role == UserRole(role))
    if status:
        filters.append(User.account_status == AccountStatus(status))
    if search:
        search_pattern = f"%{search}%"
        filters.append(
            (User.username.ilike(search_pattern)) |
            (User.email.ilike(search_pattern)) |
            (User.first_name.ilike(search_pattern)) |
            (User.last_name.ilike(search_pattern))
        )
    if class_section:
        filters.append(User.class_section.ilike(f"%{class_section}%"))
    if department:
        filters.append(User.department.ilike(f"%{department}%"))
    if classroom_id:
        filters.append(User.classroom_id == classroom_id)

    if filters:
        query = query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))

    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Apply pagination
    query = query.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    users = result.scalars().all()

    return list(users), total


async def update_user(
    db: AsyncSession,
    user_id: int,
    **kwargs,
) -> User:
    """Update user fields."""
    user = await get_user_by_id(db, user_id)
    if not user:
        raise ValueError("User not found")

    # Uniqueness checks
    if "email" in kwargs and kwargs["email"]:
        existing_email = await db.execute(
            select(User).where(User.email == kwargs["email"], User.id != user_id)
        )
        if existing_email.scalar_one_or_none():
            raise ValueError("Email already exists")

    if "student_id" in kwargs and kwargs["student_id"]:
        existing_student = await db.execute(
            select(User).where(User.student_id == kwargs["student_id"], User.id != user_id)
        )
        if existing_student.scalar_one_or_none():
            raise ValueError("Student ID already exists")

    # Handle classroom assignment (allow null to unassign)
    if "classroom_id" in kwargs:
        classroom_id = kwargs["classroom_id"]
        target_role = kwargs.get("role") or user.role.value
        if isinstance(target_role, UserRole):
            target_role = target_role.value
        if target_role != "STUDENT":
            raise ValueError("Only students can be assigned to classes")

        if classroom_id is None:
            user.classroom_id = None
        else:
            classroom = await db.execute(select(Classroom).where(Classroom.id == classroom_id))
            classroom_obj = classroom.scalar_one_or_none()
            if not classroom_obj:
                raise ValueError("Class not found")
            if not classroom_obj.teacher_id:
                raise ValueError("Class has no assigned teacher")
            user.classroom_id = classroom_id
            if classroom_obj.department:
                user.department = classroom_obj.department
            if classroom_obj.section:
                user.class_section = classroom_obj.section
            if classroom_obj.batch:
                user.batch = classroom_obj.batch

        # Prevent manual overrides when class is explicitly assigned
        if classroom_id is not None:
            kwargs.pop("department", None)
            kwargs.pop("class_section", None)
            kwargs.pop("batch", None)

        kwargs.pop("classroom_id", None)

    # Handle password change
    if "password" in kwargs and kwargs["password"]:
        kwargs["password_hash"] = hash_password(kwargs.pop("password"))
        kwargs["is_temp_password"] = False
    else:
        kwargs.pop("password", None)

    # Handle role change
    if "role" in kwargs and kwargs["role"]:
        if kwargs["role"] != "STUDENT":
            user.classroom_id = None
        kwargs["role"] = UserRole(kwargs["role"])

    for key, value in kwargs.items():
        if hasattr(user, key) and value is not None:
            setattr(user, key, value)

    user.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(user)
    return user


async def delete_user(db: AsyncSession, user_id: int) -> bool:
    """Delete a user."""
    user = await get_user_by_id(db, user_id)
    if not user:
        raise ValueError("User not found")
    await db.delete(user)
    await db.flush()
    return True


async def change_account_status(
    db: AsyncSession,
    user_id: int,
    new_status: str,
    reason: Optional[str] = None,
) -> User:
    """Change a user's account status."""
    user = await get_user_by_id(db, user_id)
    if not user:
        raise ValueError("User not found")

    user.account_status = AccountStatus(new_status)
    if new_status == "LOCKED":
        user.locked_at = datetime.now(timezone.utc)
    elif new_status == "ACTIVE":
        user.failed_login_attempts = 0
        user.locked_at = None

    user.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(user)
    return user


async def complete_profile_setup(
    db: AsyncSession,
    user_id: int,
    first_name: str,
    last_name: str,
    phone: Optional[str] = None,
    department: Optional[str] = None,
) -> User:
    """Complete profile setup — transitions to FACE_PENDING for students, ACTIVE for others."""
    user = await get_user_by_id(db, user_id)
    if not user:
        raise ValueError("User not found")

    user.first_name = first_name
    user.last_name = last_name
    if phone:
        user.phone = phone
    if department:
        user.department = department

    # Students need face approval, others go to ACTIVE
    if user.role == UserRole.STUDENT:
        user.account_status = AccountStatus.FACE_PENDING
    else:
        user.account_status = AccountStatus.ACTIVE

    user.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(user)
    return user


async def upload_face_image(
    db: AsyncSession,
    user_id: int,
    file_content: bytes,
    filename: str,
) -> User:
    """Save uploaded face image and set status to FACE_PENDING."""
    user = await get_user_by_id(db, user_id)
    if not user:
        raise ValueError("User not found")

    # Compute and store face embedding for login before saving file
    try:
        embedding = compute_face_embedding(file_content)
    except Exception as e:
        raise ValueError(str(e))

    # Create upload directory
    upload_dir = os.path.join(settings.UPLOAD_DIR, "faces")
    os.makedirs(upload_dir, exist_ok=True)

    # Generate unique filename
    ext = os.path.splitext(filename)[1] or ".jpg"
    unique_name = f"{user_id}_{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(upload_dir, unique_name)

    # Save file
    with open(file_path, "wb") as f:
        f.write(file_content)

    user.face_embedding = embedding

    user.face_image_url = f"/uploads/faces/{unique_name}"
    user.face_approved = False
    user.face_rejected_reason = None
    if user.account_status in (AccountStatus.PROFILE_SETUP_REQUIRED, AccountStatus.FACE_PENDING, AccountStatus.ACTIVE):
        user.account_status = AccountStatus.FACE_PENDING

    user.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(user)
    return user


async def approve_face(
    db: AsyncSession,
    user_id: int,
    approved: bool,
    approver_id: int,
    rejection_reason: Optional[str] = None,
) -> User:
    """Approve or reject a student's face photo."""
    user = await get_user_by_id(db, user_id)
    if not user:
        raise ValueError("User not found")

    user.face_approved = approved
    user.face_approved_by = approver_id

    if approved:
        user.account_status = AccountStatus.ACTIVE
        user.face_rejected_reason = None
    else:
        user.face_rejected_reason = rejection_reason
        user.account_status = AccountStatus.FACE_PENDING

    user.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(user)
    return user


async def get_pending_face_approvals(
    db: AsyncSession,
) -> List[User]:
    """Get all students with pending face approvals."""
    result = await db.execute(
        select(User).where(
            and_(
                User.role == UserRole.STUDENT,
                User.account_status == AccountStatus.FACE_PENDING,
                User.face_image_url.isnot(None),
            )
        ).order_by(User.updated_at.desc())
    )
    return list(result.scalars().all())


async def get_system_stats(db: AsyncSession) -> dict:
    """Get system statistics for admin dashboard."""
    # Total users
    total_result = await db.execute(select(func.count(User.id)))
    total = total_result.scalar()

    # By role
    role_result = await db.execute(
        select(User.role, func.count(User.id)).group_by(User.role)
    )
    by_role = {str(role.value): count for role, count in role_result.all()}

    # By status
    status_result = await db.execute(
        select(User.account_status, func.count(User.id)).group_by(User.account_status)
    )
    by_status = {str(status.value): count for status, count in status_result.all()}

    # Recent logins (last 24h)
    recent_result = await db.execute(
        select(func.count(LoginTrack.id)).where(
            and_(
                LoginTrack.success == True,
                LoginTrack.login_at >= datetime.now(timezone.utc) - timedelta(hours=24),
            )
        )
    )
    recent_logins = recent_result.scalar()

    return {
        "users": {
            "total": total,
            "by_role": by_role,
            "by_status": by_status,
            "recent_logins": recent_logins or 0,
        }
    }


async def get_login_history(
    db: AsyncSession,
    user_id: Optional[int] = None,
    limit: int = 50,
) -> List[LoginTrack]:
    """Get login history, optionally for a specific user."""
    query = select(LoginTrack).order_by(LoginTrack.login_at.desc()).limit(limit)
    if user_id:
        query = query.where(LoginTrack.user_id == user_id)
    result = await db.execute(query)
    return list(result.scalars().all())
