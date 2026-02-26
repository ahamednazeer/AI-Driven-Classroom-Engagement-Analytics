"""Classroom service: CRUD and teacher assignment."""

from datetime import datetime, timezone
from typing import Optional, List, Tuple

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.classroom import Classroom
from app.models.user import User, UserRole


async def create_classroom(
    db: AsyncSession,
    name: str,
    department: Optional[str] = None,
    section: Optional[str] = None,
    batch: Optional[str] = None,
    description: Optional[str] = None,
    teacher_id: Optional[int] = None,
    is_active: bool = True,
) -> Classroom:
    """Create a classroom and optionally assign a teacher."""
    existing = await db.execute(select(Classroom).where(Classroom.name == name))
    if existing.scalar_one_or_none():
        raise ValueError("Class name already exists")

    if teacher_id:
        teacher = await db.execute(select(User).where(User.id == teacher_id))
        teacher_obj = teacher.scalar_one_or_none()
        if not teacher_obj or teacher_obj.role != UserRole.TEACHER:
            raise ValueError("Teacher not found")

    classroom = Classroom(
        name=name,
        department=department,
        section=section,
        batch=batch,
        description=description,
        teacher_id=teacher_id,
        is_active=is_active,
    )
    db.add(classroom)
    await db.flush()
    await db.refresh(classroom)
    return classroom


async def get_classroom_by_id(db: AsyncSession, class_id: int) -> Optional[Classroom]:
    """Get classroom by ID with teacher loaded."""
    result = await db.execute(
        select(Classroom)
        .options(selectinload(Classroom.teacher))
        .where(Classroom.id == class_id)
    )
    return result.scalar_one_or_none()


async def get_classrooms(
    db: AsyncSession,
    teacher_id: Optional[int] = None,
    department: Optional[str] = None,
    section: Optional[str] = None,
    batch: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    per_page: int = 50,
) -> Tuple[List[Classroom], int]:
    """Get paginated list of classrooms with optional filters."""
    query = select(Classroom).options(selectinload(Classroom.teacher))
    count_query = select(func.count(Classroom.id))

    filters = []
    if teacher_id:
        filters.append(Classroom.teacher_id == teacher_id)
    if department:
        filters.append(Classroom.department.ilike(f"%{department}%"))
    if section:
        filters.append(Classroom.section.ilike(f"%{section}%"))
    if batch:
        filters.append(Classroom.batch.ilike(f"%{batch}%"))
    if search:
        pattern = f"%{search}%"
        filters.append(
            (Classroom.name.ilike(pattern)) |
            (Classroom.department.ilike(pattern)) |
            (Classroom.section.ilike(pattern))
        )

    if filters:
        query = query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    query = query.order_by(Classroom.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    classrooms = result.scalars().all()

    return list(classrooms), total


async def update_classroom(db: AsyncSession, class_id: int, **kwargs) -> Classroom:
    """Update classroom fields."""
    classroom = await get_classroom_by_id(db, class_id)
    if not classroom:
        raise ValueError("Class not found")

    if "name" in kwargs and kwargs["name"]:
        existing = await db.execute(
            select(Classroom).where(Classroom.name == kwargs["name"], Classroom.id != class_id)
        )
        if existing.scalar_one_or_none():
            raise ValueError("Class name already exists")

    if "teacher_id" in kwargs:
        teacher_id = kwargs["teacher_id"]
        if teacher_id:
            teacher = await db.execute(select(User).where(User.id == teacher_id))
            teacher_obj = teacher.scalar_one_or_none()
            if not teacher_obj or teacher_obj.role != UserRole.TEACHER:
                raise ValueError("Teacher not found")
        classroom.teacher_id = teacher_id
        kwargs.pop("teacher_id")

    for key, value in kwargs.items():
        if hasattr(classroom, key) and value is not None:
            setattr(classroom, key, value)

    classroom.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(classroom)
    return classroom


async def delete_classroom(db: AsyncSession, class_id: int) -> bool:
    """Delete classroom."""
    classroom = await get_classroom_by_id(db, class_id)
    if not classroom:
        raise ValueError("Class not found")
    await db.delete(classroom)
    await db.flush()
    return True


async def assign_teacher(db: AsyncSession, class_id: int, teacher_id: Optional[int]) -> Classroom:
    """Assign or unassign a teacher from a class."""
    return await update_classroom(db, class_id, teacher_id=teacher_id)
